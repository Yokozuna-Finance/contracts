const BASE = BigInt(32);
const ALPHA = '123456789abcdefghijkmnopqrstuvwx';
const KAI_MAPPING = {
   '1':0,  '2':1,  '3':2,  '4':3,  '5':4,  '6':5,  '7':6,  '8':7,
   '9':8,  'a':9,  'b':10, 'c':11, 'd':12, 'e':13, 'f':14, 'g':15,
   'h':16, 'i':17, 'j':18, 'k':19, 'm':20, 'n':21, 'o':22, 'p':23,
   'q':24, 'r':25, 's':26, 't':27, 'u':28, 'v':29, 'w':30, 'x':31
}

class GeneScience {

  init() {
  }

  hexToBn(hex) {
    if (hex.length % 2) {
      hex = '0' + hex;
    }

    let highbyte = parseInt(hex.slice(0, 2), 16)
    let bn = BigInt('0x' + hex);

    if (0x80 & highbyte) {
      bn = BigInt('0b' + bn.toString(2).split('').map(function (i) {
        return '0' === i ? 1 : 0
      }).join('')) + BigInt(1);
      bn = -bn;
    }
    return bn;
  }

  encode(num) {
    let buf = '';
    while (num >= BASE){
      let mod = num % BASE;
      buf = ALPHA[mod] + buf
      num = ((num - mod) / BASE) >> BigInt(0);
    }
    return ALPHA[num] + buf
  }

  _format(code) {
    return code.split('').map((d, i) => (i) % 4 == 0 ? ' ' + d : d).join('').trim();
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), "active") && !this.isLocked();
  }

  _requireContractOwner() {
    if(!blockchain.requireAuth(blockchain.contractOwner(), 'active')){
      throw 'permission denied';
    }
  }

  isLocked() {
    const now = this._getNow();
    const status = +this._get("timeLockStatus", 0);
    const until = +this._get("timeLockUntil", 0);
    return status == 1 || now < until;
  }

  mixAbilities(ability1, ability2, mint) {
    ability1 = ability1.split('-');
    ability2 = ability2.split('-');
    let limit = ability1.length > ability2.length ? ability1.length : ability2.length;

    let res = [];
    if ( mint === true ) {
      for ( let i = 0;i < limit; i++ ) {
        let avg = Math.floor(((ability1[i] + ability2[i]) / 2))
        let diff = Math.ceil((avg * 1.1) - avg);
        res.push(avg + (tx.time % diff))
      }

    } else {
      let res = [];
      for ( let i = 0;i < limit; i++ ) {
        let gt = ability1[i] > ability2[i] ? ability1[i] : ability2[i]
        res.push(gt + (tx.time % ability2[i]))
      }
    }

    return res.join("-");
  }

  mixGenes(mgenes, sgenes) {
    mgenes = mgenes.split("").reverse();
    sgenes = sgenes.split("").reverse();

    console.log('mgenes', mgenes);
    console.log('sgenes', sgenes);

    babygenes = "?".repeat(48).split("");

    for (let i = 0; i < 12; i++) {
      let index = 4 * i
      for (let j = 3; j > 0; j--) {
        if ((block.number % 100) < 25) {
          let temp1 = mgenes[index+j];
          let temp2 = mgenes[index+j-1];
          mgenes[index+j-1] = temp1;
          mgenes[index+j] = temp2;
        }
            
        if ((tx.time % 100) < 25) {
          let temp1 = sgenes[index+j];
          let temp2 = sgenes[index+j-1];
          sgenes[index+j-1] = temp1;
          sgenes[index+j] = temp2;
        }         
      }
    }

    for (let i = 0; i < 48; i++) {
      let mutation = 0
      if (i % 4 == 0) {
        let gene1 = KAI_MAPPING[mgenes[i]];
        let gene2 = KAI_MAPPING[sgenes[i]];

        if (gene1 > gene2) {
          let temp = gene1;
          gene1 = gene2;
          gene2 = temp;
        }

        if ((gene2 - gene1) == 1 && gene1 % 2 == 0) {
          let probability = 25;
          if (gene1 > 23) {
            probability /= 2

            if ((block.number % 100) < probability) {
              mutation = ALPHA[(gene1/2)+16];
            }
          }   
        }
      }

      if (mutation) {
        babygenes[i] = mutation;
      } else {
        if (tx.time % 100 < 50) {
          babygenes[i] = mgenes[i]
        } else {
          babygenes[i] = sgenes[i]
        }
      }
    }
    return babygenes.reverse().join("");
  }

  version(){
    return '0.0.1'
  }

}

module.exports = GeneScience;