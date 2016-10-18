let Eris = require("eris");
let reload = require('require-reload')(require)
let http = require('http');
let https = require('https');
let fs = require('fs');
let _config = require('./config.json');
let _stickers; // = require('./stickers.json');

try {
    _stickers = reload('./stickers.json');
} catch (e) {
    _stickers = {};
    let json = JSON.stringify(_stickers);
    fs.writeFile('stickers.json', json, 'utf8', function(){
        reloadStickers();
    });
}

let kuro = new Eris.CommandClient(_config.token, { userAccount: true }, {
    description: "A nice selfbot built in eris",
    owner: _config.owner,
    prefix: "/",
    ignoreSelf: false,
    defaultHelpCommand: false,
    defaultCommandOptions: {
        requirements: {
            "userIDs": [_config.userID]
        }
    }
});

kuro.on("ready", () => {
    console.log("[Kuro]: Ready!");
});

/*
    Usage: /sticker add _name_ attachment|_url_
    Kuro will try to upload a new sticker to stickers.json. She will either try
    to parse the url from a given string and if there is none try to get the
    public link of an attached file.

    Usage: /sticker del _name_
    Kuro will try to delete a sticker by that name on stickers.json

    Usage: /sticker list
    Kuro will list all the stickers in stickers.json

    Usage: /sticker _name_
    Kuro will try to map _file_ to an existing image through stickers.json and
    then upload said image. After it's done, she will delete the message that
    triggered the command.
*/

kuro.registerCommand("sticker", (msg, args) => {

    if(args.length === 0)
        return;

    let command = args[0];
    if (command.toString().trim() === 'add'){

        // Treat this as the name of the new sticker. Return error if name wasnt provided
        if(args[1] === undefined){
            kuro.editMessage(msg.channel.id, msg.id, "You forgot the sticker name, dumdum").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
            return;
        }

        let name = args[1];

        // Is the name of the sticker already used?
        if(name in _stickers){
            kuro.editMessage(msg.channel.id, msg.id, "You already used that name.").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
            return;
        }

        // Prepare the destination container
        let dest = './stickers/' + name;
        let url = '';

        // Stupid discord renaming stuff, breaks everything
        let discordFilename = '';

        if(args[2] !== undefined)
            url = args[2];
        else
            if(msg.attachments.length > 0)
                if('proxy_url' in msg.attachments[0]){
                    url = msg.attachments[0].proxy_url;
                    discordFilename = msg.attachments[0].filename;
                }

        if(url == ''){
            // Welp, couldn't figure out a url
            kuro.editMessage(msg.channel.id, msg.id, "You didnt supply either a url nor attachment, or there was an error with the attachment.").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
            return;
        }

        // Try and gather the extension of the file
        let re = /(?:\.([^.]+))?$/;
        let ext;

        if(discordFilename != '')
            ext = re.exec(discordFilename)[1];
        else
            ext = re.exec(url)[1];

        if(ext === undefined){
            kuro.editMessage(msg.channel.id, msg.id, "The file you are linking or trying to attach doesn't have an extension. Kuro needs that thingy").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
            return;
        }

        dest = dest + '.' + ext;
        downloadImage(name, url, dest, ext, msg);

    }else if (command.toString().trim() === 'del'){
        if(args[1] !== undefined){
            delSticker(args[1], msg);
        }
    }else if (command.toString().trim() === 'list'){

        let list = "";
        for(sticker in _stickers)
            list = list + ' ' + sticker + '\n';

        kuro.editMessage(msg.channel.id, msg.id, '```' + list + '```').then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 5000));;

    }else if (command.toString().trim() === 'show'){
        // Soon

    }else{

        let name = command;

        if(_stickers[name] === undefined){
            kuro.editMessage(msg.channel.id, msg.id, "That sticker doesnt exist. rip").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
            return;
        }

        let img = fs.readFileSync('stickers/' + _stickers[name]);;
        kuro.editMessage(msg.channel.id, msg.id, "Loading...");
        kuro.createMessage(msg.channel.id, '', {file: img, name: _stickers[name]}).then(() => kuro.deleteMessage(msg.channel.id, msg.id));

    }

});

/*
    Usage: /purge _number_
    Kuro will get the last _number_ messages from the channel where the command
    was triggered.
*/

kuro.registerCommand("purge", (msg, args) => {
    let msgCount = parseInt(args);
    kuro.getMessages(msg.channel.id, 100)
        .then((messages) => {
            let filtered = messages.filter(m => m.author.id === kuro.user.id);
            filtered.length = msgCount + 1;
            filtered.map((msg, i) => kuro.deleteMessage(msg.channel.id, msg.id));
        });
});

/*
    Usage: /status online|idle|dnd|offline
    Since this is a self bot, even if you close Discord you remain connected through
    Kuro. This command will enable you to set the status of your account whenever
    you're not on the app. So if you want to appear as 'Busy' whenever you're offline
    you can just /status dnd
*/

kuro.registerCommand("status", (msg, args) => {

    if(args.length > 0){
        switch(args[0]){
            case 'idle':
            case 'online':
            case 'dnd':
            case 'invisible':
                kuro.editStatus(args[0]);
                kuro.editMessage(msg.channel.id, msg.id, "Next time you're offline your status will be set to: " + args[0]).then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
                break;
            default:
                kuro.editMessage(msg.channel.id, msg.id, "Wrong option. You need to specify away|busy|online|invisible").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
                break;
        }
    }else{
        kuro.createMessage(msg.channel.id, 'Your offline status is: ' + msg.member.status).then(function(newmsg){
            setTimeout( () => kuro.deleteMessage(newmsg.channel.id, newmsg.id), 2000);
        });
        kuro.deleteMessage(msg.channel.id, msg.id);
    }

});

/* HELPER FUNCTIONS */
let addNewSticker = function(name, ext, msg){

    _stickers[name] = name + '.' + ext;
    let json = JSON.stringify(_stickers);
    fs.writeFile('stickers.json', json, 'utf8', function(){
        reloadStickers();
        kuro.deleteMessage(msg.channel.id, msg.id);
        kuro.createMessage(msg.channel.id, 'Sticker added succesfully fam \o/').then(function(newmsg){
            setTimeout( () => kuro.deleteMessage(newmsg.channel.id, newmsg.id), 3000);
        });
    });

}

let delSticker = function(name, msg){

    if(name in _stickers){

        delete(_stickers[name]);
        let json = JSON.stringify(_stickers);
        fs.writeFile('stickers.json', json, 'utf8', function(){
            reloadStickers();
            kuro.editMessage(msg.channel.id, msg.id, "The sticker was removed o7").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
        });

    }else{
        kuro.editMessage(msg.channel.id, msg.id, "There is no sticker by that name, you wonderful person.").then(() => setTimeout( () => kuro.deleteMessage(msg.channel.id, msg.id), 3000));
    }

}

let reloadStickers = function(){
    _stickers = reload('./stickers.json');
}

let downloadImage = function(name, url, dest, ext, msg) {
    let file = fs.createWriteStream(dest);

    let protocol = https;
    if (url.indexOf("http://") == 0)
        protocol = http;

    let request = protocol.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(addNewSticker(name, ext, msg));  // close() is async, call cb after close completes.
        });
    }).on('error', function(err) { // Handle errors
        fs.unlink(dest); // Delete the file async. (But we don't check the result)
        kuro.editMessage(msg.channel.id, msg.id, "***Error:*** " + err.message);
    });
};

kuro.connect();
