const ClientEngine = require('../../../src/ClientEngine');
const GameWorld = require('../../../src/GameWorld');
var Ship = require("./Ship");

class SpaaaceClientEngine extends ClientEngine{
    constructor(socket, gameEngine){         
        super(socket, gameEngine);


        this.worldBuffer=[];

        this.sprites = {};
    }

    start(){
        super.start();

        //  Game input
        this.cursors = game.input.keyboard.createCursorKeys();
        game.input.keyboard.addKeyCapture([ Phaser.Keyboard.SPACEBAR ]);
    }

    step(){
        //important to process inputs before running the game engine loop
        this.processInputs();
        super.step();

        //client prediction
        var world = this.gameEngine.world;
        for (var objId in world.objects) {
            if (world.objects.hasOwnProperty(objId)) {
                if (this.playerId == objId){
                    let objectData = world.objects[objId];

                    this.sprites[objectData.id].x = objectData.x;
                    this.sprites[objectData.id].y = objectData.y;
                    this.sprites[objectData.id].angle = objectData.angle;
                }
            }
        }

        //todo alter step count based on lag
        var stepToPlay = this.gameEngine.world.stepCount - 6;
        var previousWorldIndex;
        var nextWorldIndex;
        var previousWorld = null;
        var nextWorld = null;

        for (let x=0; x<this.worldBuffer.length; x++ ){
            if (this.worldBuffer[x].stepCount < stepToPlay){
                previousWorld = this.worldBuffer[x];
                previousWorldIndex = x;
            }
            if (this.worldBuffer[x].stepCount >= stepToPlay){
                nextWorld = this.worldBuffer[x];
                nextWorldIndex = x;
                break;
            }
        }

        if (previousWorld && nextWorld){
            let sprite;
            for (let objId in nextWorld.objects) {
                if (nextWorld.objects.hasOwnProperty(objId)) {
                    let prevObj = previousWorld.objects[objId];
                    let nextObj = nextWorld.objects[objId];
                    //todo refactor
                    if (prevObj == null) {
                        prevObj = nextObj;
                    }

                    if (this.sprites[objId] == null){
                        let localObj = this.gameEngine.world.objects[objId] = new Ship(nextObj.id, nextObj.x, nextObj.y);
                        localObj.velocity.set(nextObj.velX, nextObj.velY);

                        sprite = window.game.add.sprite(nextObj.x, nextObj.y, 'ship');
                        this.sprites[objId] = sprite;
                        //if own player's ship - color it
                        if (this.playerId == nextObj.id){
                            sprite.tint = 0XFF00FF;
                        }

                        sprite.anchor.setTo(0.5, 0.5);
                        sprite.width = 50;
                        sprite.height = 45;
                    }
                    else{
                        sprite = this.sprites[objId];
                    }

                    if (this.playerId != nextObj.id){

                        var playPercentage = (stepToPlay - previousWorld.stepCount)/(nextWorld.stepCount - previousWorld.stepCount);

                        if (Math.abs(nextObj.x - prevObj.x) > this.gameEngine.worldSettings.height /2){ //fix for world wraparound
                            sprite.x = nextObj.x;
                        }
                        else{
                            sprite.x = (nextObj.x - prevObj.x) * playPercentage + prevObj.x;
                        }

                        if (Math.abs(nextObj.y - prevObj.y) > this.gameEngine.worldSettings.height/2) { //fix for world wraparound
                            sprite.y = nextObj.y;
                        }
                        else{
                            sprite.y = (nextObj.y - prevObj.y) * playPercentage + prevObj.y;
                        }

                        var shortest_angle=((((nextObj.angle - prevObj.angle) % 360) + 540) % 360) - 180; //todo wrap this in a util
                        sprite.angle = prevObj.angle + shortest_angle *  playPercentage;
                    }

                }
            }

            //go over previous world to remove objects
            for (let objId in previousWorld.objects) {
                if (previousWorld.objects.hasOwnProperty(objId) && !nextWorld.objects.hasOwnProperty(objId)) {
                    delete this.gameEngine.world.objects[objId];
                    if (this.sprites[objId]) {
                        this.sprites[objId].destroy();
                    }
                    delete this.sprites[objId];
                }
            }
        }


    }

    onServerStep(worldData) {
        var worldSnapshot = GameWorld.deserialize(this.gameEngine, worldData);
        // console.log(world.stepCount - this.gameEngine.world.stepCount);
        // console.log("last handled input", world.lastHandledInput);
        this.gameEngine.world.stepCount = worldSnapshot.stepCount;

        this.worldBuffer.push(worldSnapshot);
        if (this.worldBuffer.length >= 10) {
            this.worldBuffer.shift();
        }

        for (var objId in worldSnapshot.objects) {
            if (worldSnapshot.objects.hasOwnProperty(objId)) {

                //update player character
                if (worldSnapshot.objects[objId].id == this.playerId && this.sprites[objId]) {
                    let localObj = this.gameEngine.world.objects[objId];

                    // console.log(worldSnapshot.objects[objId]);

                    localObj.x = worldSnapshot.objects[objId].x;
                    localObj.y = worldSnapshot.objects[objId].y;
                    localObj.velX = worldSnapshot.objects[objId].velX;
                    localObj.velY = worldSnapshot.objects[objId].velY;
                    localObj.velocity.set(worldSnapshot.objects[objId].velX, worldSnapshot.objects[objId].velY);
                    localObj.angle = worldSnapshot.objects[objId].angle;

                    // console.log("velx", worldSnapshot.objects[objId].velX);

                    // Server Reconciliation. Re-apply all the inputs not yet processed by
                    // the server.
                    var j = 0;
                    while (j < this.pendingInput.length) {
                        var message = this.pendingInput[j];

                        if (message.data.messageIndex <= worldSnapshot.lastHandledInput) {
                            // Already processed. Its effect is already taken into account
                            // into the world update we just got, so we can drop it.
                            this.pendingInput.splice(j, 1);
                        } else {
                            // Not processed by the server yet. Re-apply it.

                            this.gameEngine.processInput(message.data, this.playerId);
                            this.gameEngine.step();

                            j++;
                        }
                    }

                    this.sprites[objId].x = localObj.x;
                    this.sprites[objId].y = localObj.y;
                    this.sprites[objId].angle = localObj.angle;
                }
            }
        }
    };

    processInputs(){
        if (this.cursors.up.isDown)
        {
            this.sendInput('up');
        }

        if (this.cursors.left.isDown)
        {
            this.sendInput('left');
        }

        if (this.cursors.right.isDown)
        {
            this.sendInput('right');
        }
    }



    // step(){
    //     var world = this.gameEngine.world;
    //     this.gameEngine.step();
    //
    //     for (var objId in world.objects) {
    //         if (world.objects.hasOwnProperty(objId)) {
    //             if (this.playerId == objId){
    //                 let objectData = world.objects[objId];
    //
    //                 objectData.sprite.x = objectData.x;
    //                 objectData.sprite.y = objectData.y;
    //                 objectData.sprite.angle = objectData.angle;
    //             }
    //
    //         }
    //     }
    // }
    //
    // onServerStep(worldData){
    //
    //     var world = this.gameEngine.world;
    //     var worldDataDV = new DataView(worldData);
    //     var stepCount =  worldDataDV.getInt32(0);
    //
    //     var touchedIds ={}; //a temp object to figure out if some objects need to be removed
    //
    //     world.stepCount = stepCount;
    //
    //
    //     var byteOffset = Int32Array.BYTES_PER_ELEMENT;
    //
    //
    //     //go ever the buffer and deserialize items
    //     while (byteOffset < worldData.byteLength) {
    //         var objectClassId = worldDataDV.getUint8(byteOffset);
    //
    //         var objectByteSize = Ship.getNetSchemeBufferSize();
    //
    //         var objectData = Ship.deserialize(worldData.slice(byteOffset, byteOffset + objectByteSize));
    //         byteOffset += objectByteSize;
    //
    //         var localObj;
    //         var sprite;
    //
    //         if (world.objects[objectData.id]){
    //             localObj = world.objects[objectData.id];
    //             sprite = localObj.sprite;
    //
    //             localObj.x = objectData.x;
    //             localObj.y = objectData.y;
    //             localObj.velocity.set(objectData.velX, objectData.velY);
    //             localObj.angle = objectData.angle;
    //         }
    //         else{
    //             localObj = this.gameEngine.makeShip(objectData.id, objectData.x, objectData.y);
    //             sprite = localObj.sprite = window.game.add.sprite(localObj.x, localObj.y, 'ship');
    //
    //             //if own player's ship - color it
    //             if (this.playerId == objectData.id){
    //                 sprite.tint = 0XFF00FF;
    //             }
    //
    //             sprite.anchor.setTo(0.5, 0.5);
    //             sprite.width = 50;
    //             sprite.height = 45;
    //         }
    //
    //         touchedIds[objectData.id] = true; //mark as updated
    //
    //         sprite.x = objectData.x;
    //         sprite.y = objectData.y;
    //         sprite.angle = objectData.angle;
    //
    //     }
    //
    //
    //     //delete objects that weren't updated
    //     var objectsToDelete = [];
    //     for (var objId in world.objects) {
    //         if (world.objects.hasOwnProperty(objId)) {
    //             if (!touchedIds[objId]){
    //                 objectsToDelete.push(objId);
    //             }
    //         }
    //     }
    //     for (var x=0; x<objectsToDelete.length; x++){
    //         world.objects[objectsToDelete[x]].sprite.destroy();
    //         delete world.objects[objectsToDelete[x]];
    //     }
    //
    //
    // };

}


module.exports = SpaaaceClientEngine;