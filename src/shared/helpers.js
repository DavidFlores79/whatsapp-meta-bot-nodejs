function encode(sesEncoded) {
    const num = 4; // Número fijo de iteraciones
  
    for (let i = 1; i <= num; i++) {
      sesEncoded = Buffer.from(sesEncoded).toString('base64');
    }
  
    const alphaArray = ['Y', 'D', 'U', 'R', 'P', 'S', 'B', 'M', 'A', 'T', 'H'];
    sesEncoded = sesEncoded + '+' + alphaArray[num];
    sesEncoded = Buffer.from(sesEncoded).toString('base64');
  
    return sesEncoded;
  }

  module.exports = {
    encode,

  }