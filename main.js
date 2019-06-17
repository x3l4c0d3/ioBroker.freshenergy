'use strict';

/*
 *
 * x3l4 https://github.com/x3l4c0d3/ioBroker.openuv.git
 *
 */


const utils = require('@iobroker/adapter-core');
const request = require("request");


class Template extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'freshenergy',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
                
          

        
        this.subscribeStates('*');

        
        


        if (!this.config.username || !this.config.password) {
            this.log.info("Bitte füllen Sie alle Einstellungen aus."); 
        } else {
            
        this.main();
        if (!this.config.interval){
            setInterval(() => this.main(), 60000);
        } else {
            var interv = this.config.interval;
            interv = interv * 60000;
            setInterval(() => this.main(), interv);    
        }
        }
    }

    async main() {
        this.doDiscovergyCall(this.config.username, this.config.password, "meters", "","initialize");
        //this.setStateAsync('UV_safe_exposure_time6', { val: obj.result.safe_exposure_time.st6, ack: true });
      
    }

    async doDiscovergyCall(username, password, endpoint, urlencoded_parameters, pulltype) {

        const requestUrl = `https://${username}:${password}@api.discovergy.com/public/v1/${endpoint}?${urlencoded_parameters}`;
        request(requestUrl, (error, response, body) => {
    
            if (!error && response.statusCode === 200) {
                
                
    
                
                /** @type {Record<string, any>[]} */
                const objArray = JSON.parse(body);
              
                for (const meterobjects of objArray) {
    
                    
                    const firstMeasurementTime = meterobjects.firstMeasurementTime;
                   
                    const location = meterobjects.location;
                    const measurementType = meterobjects.measurementType;
                    const serialNumber = meterobjects.serialNumber;
                    const meterId = meterobjects.meterId;
                    const type = meterobjects.type;

                    if (pulltype == "initialize"){
                       
                        this.setObjectNotExists(serialNumber, {
                            type: "device",
                            common: {
                                name: serialNumber,
                            },
                            native: {},
                        });
    
                        
                        
                        
                    }
    
                
                    // Do not handle meter type RLM yet, unclear what kind of device this is and values provided
                    if (type != "RLM") {
                        this.doDiscovergyMeter(this.config.username, this.config.password, "statistics", meterId, serialNumber,pulltype);
                    }				
                }
            } else { // error or non-200 status code
                this.log.error("Connection_Failed, check your credentials !");
            }
        });
    }

    async doDiscovergyMeter(username, password, endpoint, urlencoded_parameters, serial,pulltype) {
        let t = this;
        let aktuelleZeit = new Date();
        let date1 = new Date (aktuelleZeit.getFullYear(),aktuelleZeit.getMonth(),1)
        let millisekunden = date1.getTime();
        const requestUrl = `https://${username}:${password}@api.discovergy.com/public/v1/${endpoint}?meterId=${urlencoded_parameters}&from=`+millisekunden;
        request(requestUrl, function (error, response, body) {
            
            if (!error && response.statusCode === 200) {
                // we got a response
                
                const result = body;
                const data = JSON.parse(result);
                let maximum = data.energy.maximum / 10000000000;
                let minimum = data.energy.minimum / 10000000000;
                let kwh = maximum - minimum;
                t.doStateCreate(serial + ".info" + ".kwh", "kWh", "number",  "value", "kWh");
                t.setState(serial + ".info" + ".kwh", { val: kwh, ack: true });
                let gesamtpreis = (kwh * parseFloat(t.config.arbeitspreis.replace(',','.'))) + parseFloat(t.config.grundpreis.replace(',','.'));
                t.doStateCreate(serial + ".info" + ".gesamtpreis", "Gesamtpreis", "number",  "value", "€");
                t.setState(serial + ".info" + ".gesamtpreis", { val: gesamtpreis.toFixed(2), ack: true });  
                t.doStateCreate(serial + ".info" + ".kwh_short", "kWh short", "number",  "value", "kWh");
                t.setState(serial + ".info" + ".kwh_short", { val: Math.round(kwh), ack: true });
                let aktuellerTag = aktuelleZeit.getDate();
                let monatgrundpreis = (gesamtpreis / aktuellerTag) * 30.436875;
                let monatkwh = (kwh / aktuellerTag) * 30.436875;
                t.doStateCreate(serial + ".info" + ".kwh_monat", "kWh Vorschau Monat", "number",  "value", "kWh");
                t.setState(serial + ".info" + ".kwh_monat", { val: Math.round(monatkwh), ack: true });
                t.doStateCreate(serial + ".info" + ".grundpreis_monat", "Grundpreis Vorschau Monat", "number",  "value", "€");
                t.setState(serial + ".info" + ".grundpreis_monat", { val: monatgrundpreis.toFixed(2), ack: true });
            } else { // error or non-200 status code
                t.log.error("Connection_Failed");
            }
        });
    }

    async doStateCreate(id, name, type,role, unit) {

        this.setObjectNotExists(id, {
            type: "state",
            common: {
                name: name,
                type: type,
                role: role,
                read: true,
                unit: unit,
                write: false,
            },
            native: {},
        });
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    // 	if (typeof obj === 'object' && obj.message) {
    // 		if (obj.command === 'send') {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info('send command');

    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    // 		}
    // 	}
    // }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Template(options);
} else {
    // otherwise start the instance directly
    new Template();
}