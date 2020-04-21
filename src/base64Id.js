const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const base64Id = () => {
  let str = '';
  for (let i = 0; i < 22; ++i) {
    str += base64Chars.charAt(Math.floor(Math.random() * 64));
  }
  return str;
};

export default base64Id;