// This loads the environment variables from the .env file
 require('dotenv-extended').load();
var currencyFormatter = require('currency-formatter');

var builder = require('botbuilder');
var restify = require('restify');

var connector = new builder.ChatConnector();
var bot = new builder.UniversalBot(connector);

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});
server.post('/api/messages', connector.listen());

// You can provide your own model by specifing the 'LUIS_MODEL_URL' environment variable
// This Url can be obtained by uploading or creating your model from the LUIS portal: https://www.luis.ai/
var LUISrecognizer = new builder.LuisRecognizer(process.env.LUIS_MODEL_URL);
bot.recognizer(LUISrecognizer);

// Send welcome when conversation with bot is started, by initiating the root dialog
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) 
        {
            if (identity.id === message.address.bot.id) {
                bot.beginDialog(message.address, '/Greeting');
            }
        });
    }
});


// this is the object we should persist if we want to create a new conversation anytime later
// copy it without the conversationId 

// Load all the intents from LUIS
var intents = new builder.IntentDialog({ recognizers: [LUISrecognizer] });
bot.dialog('/', intents);

bot.dialog('/Greeting', [
    function (session) {
        var cards = GreetingCard(session);

        var message = new builder.Message(session).addAttachment(cards).attachmentLayout('carousel');

        session.send(message);
        session.endDialog();
    }
]);


bot.dialog('/profile', [
    function (session, args, next) {
        session.dialogData.profile = args || {};
        if (!session.userData.name) {
            builder.Prompts.text(session, "What's your name?");
        } else {
            next();
        }
    },
    function (session, results, next) {
        if (results.response) {
            session.userData.name = results.response;
        }
        if (!session.userData.address) {
            builder.Prompts.text(session, "What is your address?");
        } else {
            next();
        }
    },
    function (session, results) {
        if (results.response) {
            session.userData.address = results.response;
        }
        session.beginDialog('/openingBalance');
    }
]);

bot.dialog('/openingBalance', [
    function (session, results, next) {
        if (!session.userData.balance) {
            builder.Prompts.number(session, "What is going to be your opening deposit?");
        } else {
            next();
        }
    },
    function (session, results, next) {
        if (results.response) {
            session.userData.balance = results.response;
            session.userData.ReadyForCheckOut = true;
            
             var card = createReceiptCard(session);

            // attach the card to the reply message
            var msg = new builder.Message(session).addAttachment(card);
            session.send(msg);
            builder.Prompts.choice(session, "Does this all look correct?", ["Yes", "No"]);
        }
    },
    function (session, results) {
        if (results.response.entity == "Yes") {
            session.replaceDialog("/finalization");
        }
        else
        {
            bot.beginDialog("/openingBalance");
        }
    }
]);


bot.dialog('/finalization', [
    function (session, results, next) {
        builder.Prompts.choice(session, "Is there anything else I can do for you?", ["Yes", "No"]);
    },
    function (session, results, next) {
        if (results.response.entity == "Yes") {
            session.endDialog();
            session.beginDialog("/Greeting");
        }
        else
        {
            session.endConversation("Thank you for banking with us today!");
        }
    }
]);

intents.matches('Thanks', [
    function (session, args, next) {
        builder.Prompts.text(session, "Glad to help! :)");
        session.endDialog();
        session.endConversation();
    }
]);

intents.matches('OpenAccount', [
    function (session, args, next) {
        var account = builder.EntityRecognizer.findEntity(args.entities, 'Account');
        if (!session.userData.account) {
            builder.Prompts.choice(session, "Which type of an account?", ["Checking","Savings","IRA", "Credit", "Debit"],  {listStyle: builder.ListStyle.button});
        } else {
            next();
        }
    },
    function (session, results) {
        if (results.response) {
            session.userData.account = results.response.entity;
            session.send("Excellent, let me get started right away on starting a new %s account for you!", session.userData.account);
            
            // Check to see if we have the user's name. If not, we need to get that
            if (!session.userData.name)
            {
                session.beginDialog('/profile');
            }
            else{
                next()
            }
        } else {
            session.send("Ok");
        }
    }
]);

intents.matches('GetMyBalance', [
    function (session, args, next) {
        var account = builder.EntityRecognizer.findEntity(args.entities, 'Account');
        
        console.log(account);
        console.log(session.message.text);
        
        var message = session.message.text;

        builder.Prompts.choice(session, "Which of your accounts?", ["Checking","Savings","IRA", "Credit", "Debit"],  {listStyle: builder.ListStyle.button});
    },
    function (session, results) {
        if (results.response) {
            session.send("Your balance is %s", currencyFormatter.format(session.userData.balance, { code: 'USD' }));
            session.replaceDialog("/finalization");
        } else {
            session.replaceDialog("GetMyBalance");
        }
    }
]);

intents.matches('None', [
    function (session, args, next) {
        builder.Prompts.text(session, "Sorry, I didn't quite understand you. Try saying 'open account'.?");
        session.endDialog();
    }
]);

bot.dialog('Help', [
    (session, args, next) => {
        session.endDialog(`You can type **add** to add numbers.`);
    }
]).triggerAction({
    matches: /^help/i,
    onSelectAction: (session, args) => {
        session.beginDialog(args.action, args);
    }
});

bot.dialog('Cancel', [
    (session, args, next) => {
        session.endDialog("OK--I've cancelled that out.");
    }
]).triggerAction({matches: /^cancel$/i})

bot.dialog('Bye', [
    (session, args, next) => {
        session.endConversation("Thanks for stopping by!");
        session.userData = null;
    }
]).triggerAction({matches: /^bye/i});

function GreetingCard(session) {
    return new builder.ThumbnailCard(session)
        .title('Welcome to Bank of Bing')
        .subtitle('The future of banking is here!')
        .text('I\'m Godfrey, your personal banking bot! You can say things like \'open account\' or \'what\'s my balance.')
        .images([
            builder.CardImage.create(session, 'https://sec.ch9.ms/ch9/7ff5/e07cfef0-aa3b-40bb-9baa-7c9ef8ff7ff5/buildreactionbotframework_960.jpg')
        ]);
}

function createReceiptCard(session) {
    return new builder.ReceiptCard(session)
        .title('New ' + session.userData.account + ' for ' + session.userData.name)
        .facts([
            builder.Fact.create(session, '1234', 'Order Number'),
            builder.Fact.create(session, 'VISA 5555-****', 'Payment Method')
        ])
        .items([
            builder.ReceiptItem.create(session, session.userData.balance, session.userData.account + ' Account')
                .quantity(368)
                .image(builder.CardImage.create(session, 'https://github.com/amido/azure-vector-icons/raw/master/renders/traffic-manager.png'))
                .quantity(720)
                .image(builder.CardImage.create(session, 'https://github.com/amido/azure-vector-icons/raw/master/renders/cloud-service.png'))
        ])
        .total("$" + session.userData.balance)
        .buttons([
            builder.CardAction.openUrl(session, 'https://azure.microsoft.com/en-us/pricing/', 'More Information')
                .image('https://raw.githubusercontent.com/amido/azure-vector-icons/master/renders/microsoft-azure.png')
        ]);
}


// Clears userData and privateConversationData, then ends the conversation
function deleteProfile(session) {
    session.userData = {};
    session.privateConversationData = {};
    session.endConversation("User profile deleted");
}

// Handle activities of type 'deleteUserData'
bot.on('deleteUserData', (message) => {
    // In order to delete any state, we need a session object, so start a dialog
    bot.beginDialog(message.address, '/deleteprofile');
});

// A dialog just for deleting state
bot.dialog('/deleteprofile', function(session) {
    // Ok, now we have a session so we can delete the state
    deleteProfile(session);
});

// Creates a middleware to handle the /deleteprofile command
function deleteProfileMiddleware() {
    return {
        botbuilder: (session, next) => {
            if (/^\/deleteprofile$/i.test(session.message.text)) {
                deleteProfile(session);
            } else {
                next();
            }
        }
    };
}

// Install middleware
bot.use(deleteProfileMiddleware());