# SIM800H

Espruino library for module SIM800H

Example to use: 

///Sending file to the server

Serial3.setup(9600,{rx:P0, tx: P1});
var at = require('AT').connect(Serial3);
var ftp = "";        //Адрес ftp.
var user = "";       //Пользователь.
var password = "";   //Пароль.
var dir = "temp/";
var fileName = "test.txt";
var data = "TEST";
var maxByte = data.length;
var APN = "internet.beeline.ru";
var user = "beeline";
var password = "beeline";
var sim = require('SIM800H').connect(Serial3, P5, function(err){
  if(err) throw err;
  sim.connect(APN, user, password, function(err) {
    if (err) throw err;
  sim.getIP(function(err, ip) {
      if (err) throw err;
      console.log('IP:' + ip);
  sim.ftpConnect(ftp, user, password, function(err){
  if (err) throw err;
    sim.ftpPutPathName(dir, fileName, function(err){
      if(err) throw err;
      sim.ftpPut(maxByte, data, function(err){
        if(err) throw err;
      });
      });
      });
    });
  });
});
*/
