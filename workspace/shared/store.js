const PREFIX = "stardewlocalapi:devtools:";

export function loadJson(key, fallback=null){
  try{
    const raw = localStorage.getItem(PREFIX + key);
    if(!raw) return fallback;
    return JSON.parse(raw);
  }catch{
    return fallback;
  }
}

export function saveJson(key, value){
  try{
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }catch{}
}

export function remove(key){
  try{ localStorage.removeItem(PREFIX + key); }catch{}
}
