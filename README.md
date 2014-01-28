**Note:** This is a work in progress

[![Build Status](https://travis-ci.org/clippPR/kaster-mongoose.png)](https://travis-ci.org/clippPR/kaster-mongoose)

Mongoose plugin to stream data to Kinesis with Avro serialization. This module relies on [Kaster](http://github.com/clippPR/kaster) and having [Amazon Kinesis](http://aws.amazon.com/kinesis/) setup.

##Example
```javascript
var 
    mongoose = require("mongoose"),
    kasterMongoose = require("kaster-mongoose"),
    schema = mongoose.Schema({
        body: String,
        user: String,
        created: Date
    });

schema.plugin(kasterMongoose, {
    region: "us-east-1",
    namespace: "MyApp.Test",
    name: "Message",
    topic: "kaster-test"
});

var MessageModel = mongoose.model("Message", schema);


var message = new MessageModel({
    body: "Hello world!",
    user: "Mark",
    created: Date.now()
});

message.save(); //After saving the message will be sent to Kinesis

```