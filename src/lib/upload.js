import env from 'node-env-file';
import PATH from 'path';
env(PATH.join(__dirname, '../../.env'));

var knox = require('knox');

var client = knox.createClient({
    key: process.env.AWS_ACCESS_KEY_ID
  , secret: process.env.AWS_SECRET_ACCESS_KEY
  , bucket: process.env.AWS_BUCKET
  , secure: false
});


export default function(localFile) {
  const key = PATH.join('shop', PATH.basename(localFile));
  return new Promise(function(res, rej) {

    client.putFile(localFile, key, {'x-amz-acl': 'public-read'}, function(err, data){
      // Always either do something with `res` or at least call `res.resume()`.
      if (err)
        return rej(err);
      let buffer = '';
      data.resume()
      .on('data', data => buffer += data)
      .on('end', () => {
        res(`http://mdrake.files.s3-website-us-east-1.amazonaws.com/${key}`);
      });

    });
  });
}
