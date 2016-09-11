import env from 'node-env-file';
import PATH from 'path';
env(PATH.join(__dirname, '../.env'));

import fetch from 'node-fetch';
import querystring from 'querystring';
import _ from 'lodash';
import path from 'path';
import FormData from 'form-data';

export function login() {
  return fetch(process.env.SHOP_LOGIN).then(token => token.json());
}

function headers(access_code, rest = {}) {
  return {
    headers: {
      authorization: `Bearer ${access_code}`,
      'accept-language': 'en',
      'hybris-currency' : 'USD',
      ...rest
    }
  }
}

function getPages(access_code) {
  const requests = [];
  for(let i = 1; i <= 10; i++) {
    const ITEMS_URL = `https://api.yaas.io/hybris/productdetails/v1/${process.env.TENANT}/productdetails?expand=media&pageNumber=${i}&pageSize=${60}&q=published:true&sort=`
    requests.push(fetch(ITEMS_URL, headers(access_code)).then(token => token.json()));
  }
  return new Promise(function(res) {
    return Promise.all(requests).then(all => res(_.flatten(all).filter(item => item.product.name.indexOf('Your Niner') === -1)));
  });

}

const SITES_URL = `https://api.yaas.io/hybris/site/v1/${process.env.TENANT}/sites`;
const CART_URL = `https://api.yaas.io/hybris/cart/v1/${process.env.TENANT}/carts?siteCode=main`;
const CATEGORY_URL = `https://api.yaas.io/hybris/category/v1/${process.env.TENANT}/categories?expand=subcategories&toplevel=true`;

export function site(access_code) {

getCart(access_code);
  return Promise.all([
    fetch(SITES_URL, headers(access_code)).then(token => token.json()),
    fetch(CART_URL, headers(access_code)).then(token => token.json()),
    fetch(CATEGORY_URL, headers(access_code)).then(token => token.json()),
    getPages(access_code)
  ]).then(([site, cartResult, category, items]) => {
    return new Promise(function(resolve) {
      if (cartResult && cartResult.status !== 404) {
        return resolve([site, cartResult, category, items]);
      }
      cart(access_code).then(function(cartResult) {
        return resolve([site, cartResult, category, items]);
      });

    });
  });
}

const CART_POST_URL = `https://api.yaas.io/hybris/cart/v1/${process.env.TENANT}/carts`;
const ITEM_PATH = '/items';
export function cart(access_code, cart_id, item, count = 1) {
  const theHeaders = headers(access_code, {'Accept': 'application/json',
    'Content-Type': 'application/json'});
  if (!cart_id) {
    const payload = {currency: "USD", siteCode: "US", channel: {name: "yaas-storefront", source: "localhost"}};
    const options = {method: 'POST', ...theHeaders, body: JSON.stringify( payload )};
    return fetch(CART_POST_URL, options).then(res => res.json());
  }
  const itemPayload = {...item, "quantity": count};

  const options2 = {method: 'POST', ...theHeaders, body: JSON.stringify( itemPayload )};
  return fetch(CART_POST_URL + '/' + cart_id + ITEM_PATH, options2).then(res => res.json());
}

export function getCart(access_code, cart_id) {
  const CART_URL = `https://api.yaas.io/hybris/cart/v1/${process.env.TENANT}/carts/${cart_id}/items?siteCode=main`;
  return fetch(CART_URL, headers(access_code)).then(token => token.json());
}
