/*

///Sendig file to the server

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


var at;
var socks = [];
var sockData = ["","","","",""];
var MAXSOCKETS = 5;
var busy = false;

//Подача 1 и 0 на пин.
function ON(Pin){
    Pin.mode('output');
    Pin.write(true);
}
function OFF(Pin){
    Pin.mode('output');
    Pin.write(false);
}
  

function unregisterSocketCallbacks(sckt) {
    at.unregister('>');
    at.unregisterLine(sckt + ', SEND OK');
    at.unregisterLine(sckt + ', SEND FAIL');
}

var netCallbacks = {
  create: function(host, port) {
    if (host===undefined) {
      sckt = MAXSOCKETS;
      socks[sckt] = "Wait";
      sockData[sckt] = "";
      at.cmd("AT+CIPSERVER=1,"+port+"\r\n", 10000, function(d) {
        if (d=="OK") {
          socks[sckt] = true;
        } else {
          socks[sckt] = undefined;
          throw new Error("CIPSERVER failed");
        }
      });
      return MAXSOCKETS;
    } else {
      var sckt = 0;
      while (socks[sckt]!==undefined) sckt++; 
      if (sckt>=MAXSOCKETS) throw new Error('No free sockets.');
      socks[sckt] = "Wait";
      sockData[sckt] = "";
      at.cmd('AT+CIPSTART='+sckt+',"TCP",'+JSON.stringify(host)+','+port+'\r\n',10000, function(d) { 
        if (d=="OK") {
          at.registerLine(sckt + ', CONNECT OK', function() {
            at.unregisterLine(sckt + ', CONNECT OK');
            at.unregisterLine(sckt + ', CONNECT FAIL');  
            socks[sckt] = true;
            return "";
          });
          at.registerLine(sckt + ', CONNECT FAIL', function() {
            at.unregisterLine(sckt + ', CONNECT FAIL');
            at.unregisterLine(sckt + ', CONNECT OK');
            at.unregisterLine(sckt + ', CLOSED');  
            socks[sckt] = undefined;
            return "";
          });
          at.registerLine(sckt + ', CLOSED', function() {
            at.unregisterLine(sckt + ', CLOSED');
            unregisterSocketCallbacks(sckt);
            socks[sckt] = undefined;
            busy = false;
            return "";
          });
        } else {
          socks[sckt] = undefined;
          return "";    
        }
      });
    }
    return sckt; 
  },
  close: function(sckt) {
    if(socks[sckt]) {
      at.cmd('AT+CIPCLOSE='+sckt+",1\r\n",1000, function(/*d*/) {   
        socks[sckt] = undefined;
      });
      
    }
  },
  accept: function(sckt) {
    for (var i=0;i<MAXSOCKETS;i++)
      if (sockData[i] && socks[i]===undefined) {
        socks[i] = true;
        return i;
      }
    return -1;
  },
  recv: function(sckt, maxLen) {
    if (at.isBusy() || socks[sckt]=="Wait") return "";
    if (sockData[sckt]) {
      var r;
      if (sockData[sckt].length > maxLen) {
        r = sockData[sckt].substr(0,maxLen);
        sockData[sckt] = sockData[sckt].substr(maxLen);
      } else {
        r = sockData[sckt];
        sockData[sckt] = "";
      }
      return r;
    }
    if (!socks[sckt]) return -1; 
    return "";
  },
  send: function(sckt, data) {
    if (busy || at.isBusy() || socks[sckt]=="Wait") return 0;
    if (!socks[sckt]) return -1; 
    busy = true;
    at.register('>', function() {
      at.unregister('>');
      at.write(data);
      return "";
    });
    at.registerLine(sckt + ', SEND OK', function() {
      at.unregisterLine(sckt + ', SEND OK');
      at.unregisterLine(sckt + ', SEND FAIL');
      busy = false;
      return "";
    });
    at.registerLine(sckt + ', SEND FAIL', function() {
      at.unregisterLine(sckt + ', SEND OK');
      at.unregisterLine(sckt + ', SEND FAIL');
      busy = false;
      return -1;
    });  
    at.write('AT+CIPSEND='+sckt+','+data.length+'\r\n');
    return data.length;
  }
};

function receiveHandler(line) {
  var colon = line.indexOf(":\r\n");
  if (colon<0) return line;
  var parms = line.substring(9,colon).split(",");
  parms[1] = 0|parms[1];
  var len = line.length-(colon+3);
  if (len>=parms[1]) {
   sockData[parms[0]] += line.substr(colon+3,parms[1]);
   return line.substr(colon+parms[1]+3); 
  } else { 
   sockData[parms[0]] += line.substr(colon+3,len);
   return "+D,"+parms[0]+","+(parms[1]-len)+":"; 
  }
}

function receiveHandler2(line) {
  var colon = line.indexOf(":");
  if (colon<0) return line; 
  var parms = line.substring(3,colon).split(",");
  parms[1] = 0|parms[1];
  var len = line.length-(colon+1);
  if (len>=parms[1]) {
   sockData[parms[0]] += line.substr(colon+1,parms[1]);
   return line.substr(colon+parms[1]+1); 
  } else { 
   sockData[parms[0]] += line.substr(colon+1,len);
   return "+D,"+parms[0]+","+(parms[1]-len)+":";   
  }
}

var simFuncs = {

  receiveHandler: receiveHandler,

  "debug" : function() {
    return {
      socks:socks,
      sockData:sockData
    };
  },

  /*Включение модема 1 на powerPin, через секунду выставляем 0, чтобы не отрубился. 
  Через 15 секунд (время на поиск сети и т.д.) после включения автоматически начинает инициализацию*/
  "powerOn": function(powerPin, callback){ 
    ON(powerPin);
    setTimeout(function(){
    	OFF(powerPin);
    	setTimeout(simFuncs.init, 15000, callback);
    }, 1000);
  },

//Выключение модема через resetPin.
  "powerOff": function(resetPin){       
    setTimeout(ON, 10000, resetPin);
  },

  // инициализация
  "init": function(callback) {
    var s = 0;
    var cb = function(r) {
      switch(s) {
        case 0:
          if(r === 'IIIIATE0' || 
            r === 'IIII' + String.fromCharCode(255) + 'ATE0' || 
            r === 'ATE0') {
            return cb;
          } else if(r === 'OK') {
            s = 1;
            at.cmd('AT+CPIN?\r\n', 3000, cb); // Статус пин кода.
          } else if(r) {
            callback('Error in ATE0: ' + r);
          }
          break;
        case 1:
          if(r === '+CPIN: READY') {
            return cb;
          } else if (r === 'OK') {
            s = 2;
            // check if we're on network
            at.cmd('AT+CGATT=1\r\n', 3000, cb); // подключение GPRS сервиса.
          } else if(r) {
            callback('Error in CPIN: ' + r);
          }
          break;
        case 2:
          if(r === 'OK') {
            s = 3;
            at.cmd('AT+CIPSHUT\r\n', 3000, cb); //Сброс всех tcp/ip соединений.
          } else if(r) {
            callback('Error in CGATT: ' + r);
          }
          break;
        case 3:
          if(r === 'SHUT OK') {
            s = 4;
            at.cmd('AT+CIPSTATUS\r\n', 3000, cb); // Проверка статуса.
          } else if(r) {
            callback('Error in CIPSHUT: ' + r);
          }
          break;
        case 4:
          if(r === 'OK') {
            return cb;
          } else if(r === 'STATE: IP INITIAL') {
            s = 5;
            at.cmd('AT+CIPMUX=1\r\n', 3000, cb); //Режим множественного подключения.
          }
          else if(r) {
            callback('Error in CIPSTATUS: ' + r);
          }
          break;
        case 5:
          if (r&&r.substr(0,3)=="C: ") {
            return cb;
          } else if(r === 'OK') {
            s = 6;
            at.cmd('AT+CIPHEAD=1\r\n', 3000, cb); // При получении данных добавлять IP в заголовок.
          }  else if(r) {
            callback('Error in CIPMUX: ' + r);
          }
          break;
        case 6:
          if(r === 'OK') {
            return cb;
          } else if(r) {
             callback('Error in CIPHEAD: ' + r);
          } else {
            callback(null);
          }
          break;
      }
    };
    at.cmd("ATE0\r\n",3000,cb); //отключение эхо.
  },

  //Версия модема
  "getVersion": function(callback) {
    at.cmd("AT+GMR\r\n", 1000, function(d) {
      callback(null,d);
    });
  },

  //Настройка подключения к интернету
  "connect": function(apn, username, password, callback) {
    var s = 0;
    var cb = function(r) {
      switch(s) {
        case 0:
          if(r === 'OK') {
            s = 1;
            at.cmd('AT+CIICR\r\n', 2000, cb); // Поднять соединение.
          } else if(r) {
            callback('Error in ' + s + ': ' + r);
          }
          break;
        case 1:
          if(r === 'OK') {
            return cb;
          }
          else if (r) {
            callback('Error in ' + s + ': ' + r);
          } else {
            callback(null);
          }
          break;
      }
    };
    at.cmd('AT+CSTT="' + apn + '", "' + username + '", "' + password + '"\r\n', 1000, cb); //Установка APN, username, password. 
  },

  //Получение IP.
  "getIP": function(callback) {
    var ip;
    var cb = function(r) {
      if(r && r != 'ERROR' && r != 'OK') {
        ip = r;
        return cb;
      } else if(r === 'ERROR') {
        callback('CIFSR Error');
      } else if(!r) {
        callback(null, ip);
      }
    };
    at.cmd('AT+CIFSR\r\n', 2000, cb); //Получение ip.
  },

  //Данные ftp соединения хост или url, имя, пароль.
  "ftpConnect": function(ftpHost, username, password, callback) {
    at.cmd("AT+SAPBR=0,1\r\n", 1000); // Разорвать установленные ранее соединения с ftp/
    at.cmd('AT+FTPPUTOPT="STOR"\r\n', 1000); // Создавать новый файлы, если их нет или перезаписывать существующие.
    var s = 0;
    var cb = function(r) {
      switch(s){
        case 0:
        if(r === 'OK') {
          s = 1;
          at.cmd('AT+FTPCID=1\r\n', 2000, cb); //Установка CID для FTP сессии.
        } else if(r){
          callback('Error connect to GPRS:' + r);
        }
        break;
        case 1:
        if(r === 'OK'){
          s = 2;
          at.cmd('AT+FTPSERV="' + ftpHost + '"\r\n', 2000, cb); //Хост сервера или url.
        } else if(r) {
          callback('Error in CID:' + r);
        }
        break;
        case 2:
        if(r === 'OK') {
          s = 3;
          at.cmd('AT+FTPUN="' + username + '"\r\n', 2000, cb); //Имя пользователя.
        } else if(r) {
          callback('Error ftpUrl:' + r);
        }
        break;
        case 3:
        if(r === 'OK') {
          s = 4;
          at.cmd('AT+FTPPW="' + password + '"\r\n', 2000, cb); //Пароль.
        } else if (r){
          callback('Error username:' + r);
        }
        break;
        case 4:
        if(r === 'OK') {
          return cb;
        } else if(r) {
          callback('Error password:' + r);
        } else {
          callback(null);
        }
        break;
      }
    };
    at.cmd('AT+SAPBR=1,1\r\n', 2000, cb); //Открытие GPRS соединения для подключния к FTP.
  }, 

  //Установка директории и имени файла, откуда будем брать.
  "ftpGetPathName": function(dir, fileName, callback) {
    var s = 0;
    var cb = function(r) {
      switch(s){
        case 0:
        if(r === 'OK') {
          s = 1;
          at.cmd('AT+FTPGETNAME="' + fileName + '"\r\n', 2000, cb); //Имя нужного файла.
        } else if(r) {
          callback('Error dir:' + r);
        }
        break;
        case 1:
        if(r === 'OK') {
          return cb;
        } else if(r) {
          callback('Error fileName:' + r);
        } else {
          callback(null);
        }
        break;
      }
    };
    at.cmd('AT+FTPGETPATH="' + dir + '"\r\n', 2000, cb); //Директория в которой лежит файл.
  },

  

  //Соединение с ftp, возвращает данные и размер полученных данных.
  "ftpGet": function(maxByte, callback) {
    var s = 0;
    var cb = function(r) {
        switch(s) {
        case 0:
        s = 1;
        setTimeout(function(){at.cmd('AT+FTPGET=2,' + maxByte + '\r\n',2000, cb);}, 4000); //Объем данных в байтах, которые нужно плучить.
        break;
        case 1:
        if(r && r != 'ERROR' && r != 'OK'){
          var data = r;
          callback(null, data);
        return cb;
      }
        break;
      }
    };
    at.cmd("AT+FTPGET=1\r\n", 2000, cb); //Подключение к ftp.
  }, 

  //Установка директории и имени файла, куда будем класть.
  "ftpPutPathName": function(dir, fileName, callback) {
    var s = 0;
    var cb = function(r) {
      switch(s){
        case 0:
        if(r === 'OK') {
          s = 1;
          at.cmd('AT+FTPPUTNAME="' + fileName + '"\r\n', 2000, cb); //Имя записываемого файла.
        } else if(r) {
          callback('Error dir:' + r);
        }
        break;
        case 1:
        if(r === 'OK') {
          return cb;
        } else if(r) {
          callback('Error fileName:' + r);
        } else {
          callback(null);
        }
        break;
      }
    };
    at.cmd('AT+FTPPUTPATH="' + dir + '"\r\n', 2000, cb); //Директория, куда нужно записать.
  },

  //Соединение с ftp и отправить данные.
  "ftpPut": function(maxByte, data, callback) {
    var s = 0;
    var cb = function(r) {
        switch(s) {
        case 0:
          s = 1;
          setTimeout(function(){at.cmd('AT+FTPPUT=2,' + maxByte + '\r\n',1000, cb);}, 4000); //Объем передаваемой информации в байтах.
        break;
        case 1:
        if(r != 'ERROR'){
          s = 2;
          at.cmd("" + data + "\n", 1000, cb);
        } else{
          callback("Write Error: " + r);
        }
        break;
        case 2:
        if (r === "OK") {
          s = 3;
          at.cmd('AT+FTPPUT=2,0\r\n', 1000, cb); //Конец записи, закрытие сессии.
        } else if (r) {
          callback("Write Error: " +r);
        } 
        break;
        case 3:
        if(r){
          callback(null);
          return cb;
        }
        break;
      }
    };
    at.cmd("AT+FTPPUT=1\r\n", 1000, cb); //Соединение с ftp для записи.
  }
};


exports.connect = function(usart, powerPin, connectedCallback) {
  simFuncs.at = at = at = require('AT').connect(usart);
  require("NetworkJS").create(netCallbacks); // В тонкости Network JS не лез, оставил эти моменты как есть.
  at.register("+RECEIVE", receiveHandler);
  at.register("+D", receiveHandler2);
  simFuncs.powerOn(powerPin, connectedCallback); // Автоматическое включение модема, если был выключен.
  return simFuncs;
};
