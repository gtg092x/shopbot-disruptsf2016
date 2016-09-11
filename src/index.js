import env from 'node-env-file';
import PATH from 'path';
env(PATH.join(__dirname, '../.env'));

import _ from 'lodash';
import Botkit from 'botkit';

import {login, site} from './store';

import { defaultController } from './controllers';

const controller = Botkit.slackbot({
  debug: false
});

login().then(({access_token, expires_in}) => {
// connect the bot to a stream of messages

  site(access_token).then(([site, cart, categories, items]) => {
    controller.spawn({
      token: process.env.SLACK_KEY,
    }).startRTM();

    const meta = {access_token, expires_in, site, cart, categories, items: items.filter(item => !!item.prices)};

    controller.hears('(.*)', ['direct_message','direct_mention','mention'], defaultController.bind(this, meta));
  });

});
