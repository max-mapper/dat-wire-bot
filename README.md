# dat-wire-bot

work in progress

a Wire bot that can back up and seed Dat repositories

ported from the [original irc bot](https://github.com/mafintosh/hypercore-archiver-bot)

to setup ssl: `sudo certbot -d <domain> --authenticator standalone --installer nginx --pre-hook "nginx -s stop" --post-hook "nginx"`

to get your public key: `sudo openssl rsa -in /etc/letsencrypt/live/<domain>/privkey.pem -pubout`

to run the bot: `dat-wire-bot --key='privkey.pem' --cert='cert.pem' --auth='your-token'