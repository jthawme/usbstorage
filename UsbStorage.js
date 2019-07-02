const { exec } = require('child_process');
const usb = require('usb');
const drivelist = require('drivelist');

function errorMsg(msg) {
    return {
        custom: true,
        msg
    };
}

function escapePath(pathname) {
    return pathname.replace(/(\s+)/g, '\\$1');
}

class UsbStorage {
    constructor(opts = {}) {
        this.defaults = {
            max_tries: 10,
            ejectAfterMove: true
        };

        this.options = Object.assign({}, this.defaults, opts);

        this.events = {
            error: [],
            checking: [],
            mounting: [],
            mounted: [],
            uploading: [],
            uploaded: [],
            ejected: []
        };

        this.deviceList = [];
        this._getDrives()
            .then(drives => {
                this.deviceList = drives;
            });

        this._addEventListeners();
    }

    _getDrives() {
        return drivelist.list()
            .then(drives => drives.filter(d => d.isUSB));
    }

    _isEvent(event) {
        return Object.keys(this.events).includes(event);
    }

    on(event, fn = () => {}) {
        if (!this._isEvent(event)) {
            return false;
        }

        this.events[event].push(fn);
    }

    _fireEvent(event, options) {
        if (!this._isEvent(event)) {
            return false;
        }

        for (let i = 0; i < this.events[event].length; i++) {
            this.events[event][i](options);
        }
    }

    _addEventListeners() {
        usb.on('attach', () => this.addDevices());
        usb.on('detach', () => this.removeDevices());
    }

    addDevices() {
        return this.waitForMount()
            .then(drives => this._filterDrives(drives))
            .then(({ added }) => this.getMountpoints(added))
            // .then(uploadFiles)
            .catch(err => this._catchError(err));
    }

    waitForMount() {
        this._fireEvent('checking');

        return new Promise((resolve, reject) => {
            let timer;
            const check = (tries) => {
                if (tries >= this.options.max_tries) {
                    return reject(errorMsg("No new storage devices"));
                }

                this._getDrives()
                    .then(drives => {
                        clearTimeout(timer);
            
                        if (drives.length == this.deviceList.length) {
                            timer = setTimeout(() => check(tries + 1), 500);
                        } else {
                            resolve(drives);
                        }
                    })
                    .catch(err => reject(err));
            };

            check(0);
        });
    }

    getMountpoints(drives) {
        this._fireEvent('mounting');

        return new Promise((resolve, reject) => {
            const check = (tries) => {
                if (tries >= this.options.max_tries) {
                    return reject(errorMsg("Maximum retries "));
                }
                
                this._getDrives()
                    .then(currentDrives => {
                        const matchedDrives = currentDrives.filter(d => drives.find(_d => _d.device == d.device));
            
                        const notMounted = matchedDrives.some(d => !d.mountpoints || d.mountpoints.length == 0);
                
                        if (notMounted) {
                            setTimeout(() => check(tries + 1), 500);
                        } else {
                            this._fireEvent('mounted', matchedDrives);
                            resolve(matchedDrives);
                        }
                    })
                    .catch(err => reject(err));
            }
    
            check(0);
        });
    }

    removeDevices() {
        return this._getDrives()
            .then(drives => this._filterDrives(drives))
            .catch(err => this._catchError(err));
    }

    _filterDrives(drives) {
        const added = drives.filter(newDevice => {
            return !this.deviceList.find(d => d.device == newDevice.device);
        });
        const removed = this.deviceList.filter(oldDevice => {
            return !drives.find(d => d.device == oldDevice.device);
        });

        this.deviceList = drives;

        if (added.length == 0 && removed.length == 0) {
            throw errorMsg("No new usb drives");
        }
        
        return { added, removed };
    }

    _catchError(err) {
        this._fireEvent('error', err);
    }

    execPromise(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        })
    }

    moveFileToDrive(drive, file) {
        this._fireEvent('uploading');

        this.execPromise(`cp ${file} ${escapePath(drive.mountpoints[0].path)}`)
            .then(() => {
                this._fireEvent('uploaded');
                return this.execPromise(`diskutil unmountDisk ${drive.device}`)
            })
            .then(() => {
                this._fireEvent('ejected');
            });
    }
}

module.exports = UsbStorage;