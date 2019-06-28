const fs = require('fs');
const { exec } = require('child_process');
const usb = require('usb');
const drivelist = require('drivelist');

const MAX_TRIES = 10;
let deviceList = [];

drivelist.list()
    .then(drives => deviceList = drives.filter(d => d.isUSB));

usb.on('attach', () => addDevices());
usb.on('detach', () => removeDevices());

function errorMsg(msg) {
    return {
        custom: true,
        msg
    };
}

function waitForMount() {
    return new Promise((resolve, reject) => {
        let timer;
        const check = () => {
            drivelist.list().then(drives => {
                clearTimeout(timer);
    
                console.log("Checking drives...");
                const _drives = drives.filter(d => d.isUSB);
    
                if (_drives.length == deviceList.length) {
                    timer = setTimeout(() => check(), 500);
                } else {
                    resolve(_drives);
                }
            });
        };

        check();
    });
}

function filterDrives(drives) {
    const added = drives.filter(newDevice => {
        return !deviceList.find(d => d.device == newDevice.device);
    });
    const removed = deviceList.filter(oldDevice => {
        return !drives.find(d => d.device == oldDevice.device);
    });

    deviceList = drives;

    if (added.length == 0 && removed.length == 0) {
        throw errorMsg("No new usb drives");
    }
    
    return { added, removed };
}

function getMountpoints(drives) {
    return new Promise((resolve, reject) => {
        const check = (tries) => {
            if (tries >= MAX_TRIES) {
                return reject(errorMsg("Maximum retries "));
            }
            
            drivelist.list()
                .then(currentDrives => {
                    const matchedDrives = currentDrives.filter(d => drives.find(_d => _d.device == d.device));

                    console.log("Checking mountpoints...");
        
                    const notMounted = matchedDrives.some(d => !d.mountpoints || d.mountpoints.length == 0);
            
                    if (notMounted) {
                        setTimeout(() => check(tries + 1), 500);
                    } else {
                        resolve(matchedDrives);
                    }
                })
        }

        check(0);
    });
}

function addDevices() {
    waitForMount()
        .then(filterDrives)
        .then(({ added }) => getMountpoints(added))
        .then(uploadFiles)
        .catch(err => {
            if (err.custom) {
                console.log(err);
            } else {
                console.error(err);
            }
        });
}

function removeDevices() {
    drivelist.list()
        .then(devices => devices.filter(d => d.isUSB))
        .then(filterDrives)
        .catch(err => {
            if (err.custom) {
                console.log(err);
            } else {
                console.error(err);
            }
        });
}

function escapePath(pathname) {
    return pathname.replace(/(\s+)/g, '\\$1');
}

function uploadFiles(drives) {
    if (drives.length) {
        exec(`cp pic.jpg ${escapePath(drives[0].mountpoints[0].path)}`);
        exec(`diskutil unmountDisk ${drives[0].device}`);
    }
}