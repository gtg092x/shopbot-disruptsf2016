import nlp from 'nlp_compromise';
import natural from 'natural';
import Botkit from 'botkit';
import {getCart, cart as putCart} from '../store';

const MATCH_THRESHOLD = 0.3;

function toSentence(items, article = 'or') {
  const end = items.pop();
  return [items.join(', '), end].join(`, ${article} `);
}

function getCategories(meta) {
  return toSentence(meta.categories.map(item=>item.name));
}

function affirmative(text) {
  return nlp.text(text).root() === 'yes';
}

const cancelWords = ['nevermind', 'forget it', 'stop', 'no'];
function cancel(text) {
  return distanceCompare(0.8, text, cancelWords);
}

function distanceCompare(threshold, text, items) {
  let maxMatch = 0;
  let index = 0;
  const _text = nlp.text(text).root();
  for(let i = 0; i < items.length; i ++) {
    const match = natural.JaroWinklerDistance(_text, items[i]);
    if(match > maxMatch) {
      index = i;
      maxMatch = match;
    }
  }
  return maxMatch > threshold;
}

function bestMatch(convo, text, items, meta) {
  const [term] = nlp.sentence(text).terms.filter(term => term.tag === 'Noun');
  if (!term) {
    return new Promise(res => res(-2));
  }
  let maxMatch = 0;
  let index = 0;
  let possibilities = [];
  for(let i = 0; i < items.length; i ++) {
    const match = natural.JaroWinklerDistance(term.text, items[i]);
    if(match > maxMatch) {
      index = i;
      maxMatch = match;
    }
    possibilities.push({i, match, item: items[i]});
    possibilities = possibilities.filter(({i, match}) => Math.abs(match - maxMatch) < .01);
  }
  return new Promise(resolve => {
    if (maxMatch > MATCH_THRESHOLD) {
      if (possibilities.length > 1) {
        convo.next();
        convo.ask(`Did you mean ${toSentence(possibilities.map(p => p.item))}?`, function(response, convo) {
          bestMatch(convo, response.text, possibilities.map(p => p.item), meta).then(index => resolve(possibilities[index].i));
        });
        return convo.next();
      }
      return resolve(index);
    }
    if (maxMatch === 0) {
      return resolve(-1);
    }
    convo.next();
    convo.ask(`Did you mean ${items[index]}?`, function(response, convo) {
      if (cancel(response.text)) {
        return home(meta, response, convo);
      }
      if (affirmative(response.text)) {
        return resolve(index);
      }
      resolve(-1);
    });
  });
}

function checkout(meta, response, convo) {
  getCart(meta.access_token, meta.cart.cartId).then(items => {
    console.log(items);
    convo.say(`Thank you! Click on the link below to check out.
http://localhost:9000/?items=${items.map(i => i.yrn).join(',')}`);
    convo.next();
  });

}

function cart(meta, response, convo) {
  getCart(meta.access_token, meta.cart.cartId).then(cart => {
    console.log(cart);
    convo.next();
    const total = cart.reduce((memo, item) => Number(item.price.effectiveAmount) + memo, 0);
    convo.say(`You have ${toSentence(cart.map(item => item.product.name), 'and')} in your cart. ($${total})`);
    return home(meta, response, convo);
  }).catch(err => {
    console.error(err);
    convo.say('error sorry');
    return home(meta, response, convo);
  });

}

function addToCart(meta, response, convo, itemArg) {
  const item = itemArg.price ? itemArg : {...itemArg, price: itemArg.prices[0]};
  delete item.prices;
  putCart(meta.access_token, meta.cart.cartId, item).then(result => {
    console.log(result);
    convo.next();
    return home(meta, response, convo);
  }).catch(err => {
    convo.next();
    console.error(err);
    convo.say('error sorry');
    convo.next();
    return home(meta, response, convo);
  });

}

function categories(meta, response, convo) {
  const itemMessage = `${getCategories(meta)}`;
  convo.next();
  convo.ask(itemMessage, next.bind(this, meta));
}

function items(meta, response, convo) {
  bestMatch(convo, response.text, meta.items.map(item => item.product.name), meta).then(index => {
    const item = meta.items[index];
    if (item.product.media && item.product.media[0]) {
      convo.say(item.product.media[0].url);
      convo.next();
    }
    convo.ask(`add ${item.product.name} to cart?`, function(res, convo) {
      if (affirmative(res.text)) {
        return addToCart(meta, res, convo, meta.items[index]);
      }
      return home(meta, res, convo);
    });
    convo.next();
  });
}

function homeResponse(meta, response, convo) {

  return [
    {
      pattern: 'checkout',
      callback: function(response,convo) {
        checkout(meta, response, convo);
        convo.next();
      }
    },
    {
      pattern: ['cart'],
      callback: function(response,convo) {
        cart(meta, response, convo);
      }
    },
    {
      pattern: ['categories'],
      callback: function(response,convo) {
        categories(meta, response, convo);
      }
    },
    {
      pattern: ['yes', 'yup'],
      callback: function(response,convo) {
        convo.ask(`What Can I get you?`, next.bind(this, meta));
        convo.next();
      }
    },
    {
      pattern: ['no', 'nope'],
      callback: function(response,convo) {
        checkout(meta, response, convo);
        convo.next();
      }
    },
    {
      pattern: 'help',
      callback: function(response,convo) {
        // just repeat the question
        convo.ask(`Say "what's in my cart?" "What are you categories?"`, homeResponse(meta, response, convo));
      }
    },
    {
      default: true,
      callback: function(response,convo) {
        items(meta, response, convo);
        convo.next();
      }
    }
  ]
}

function home(meta, response, convo) {

  console.log('HOME');
  convo.next();
  convo.ask('Do you need anything else?', homeResponse(meta, response, convo));
  return convo.next();
}

function next(meta, response, convo) {
  if (cancel(response.text)) {
    return home(meta, response, convo);
  }
  bestMatch(convo, response.text, meta.items.map(item=>item.product.name), meta).then(index => {
    const item = meta.items[index];
    if (item.product.media && item.product.media[0]) {
      convo.say(item.product.media[0].url);
      convo.next();
    }
    convo.ask(`($${item.prices[0].effectiveAmount}) add ${item.product.name} to cart?`, function(res, convo) {
      if (affirmative(res.text)) {
        return addToCart(meta, res, convo, meta.items[index]);
      }
      return home(meta, res, convo);
    });
    convo.next();
  });
}

function defaultController(meta, bot, message) {
  const text = message.text;
  return bot.startConversation(message, function(err, convo) {

    const itemMessage = `Welcome to my store! Interested in anything?`;
    convo.ask(itemMessage, next.bind(this, meta));
  });
}


export {defaultController};
