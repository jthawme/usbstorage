const UsbStorage = require('./UsbStorage');

const usb = new UsbStorage();

usb.on('error', err => console.log('error', err));
usb.on('checking', () => console.log('checking'));
usb.on('mounting', () => console.log('mounting'));
usb.on('mounted', drives => {
    console.log('mounted', drives)
    usb.moveFileToDrive(drives[0], `${__dirname}/pic.jpg`);
});
usb.on('uploading', () => console.log('uploading'));
usb.on('uploaded', () => console.log('uploaded'));
usb.on('ejected', () => console.log('ejected'));