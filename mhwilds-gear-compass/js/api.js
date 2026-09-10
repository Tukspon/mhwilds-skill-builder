// js/api.js — talks to the wilds.mhdb.io API (with a CORS-relay fallback).
const API_BASE = 'https://wilds.mhdb.io/ja';

// Some browsers/environments (especially local file:// pages) get blocked by
// the API's CORS policy. If a direct request fails, retry once through a
// public CORS relay before giving up.
async function fetchJson(url){
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  }catch(directErr){
    try{
      const proxied = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      const res2 = await fetch(proxied);
      if(!res2.ok) throw new Error(`HTTP ${res2.status} ${res2.statusText}`);
      return await res2.json();
    }catch(proxyErr){
      throw new Error(`直接アクセス失敗: ${directErr.message} / 代替経路も失敗: ${proxyErr.message}\nURL: ${url}`);
    }
  }
}

// Fetches every page of a list endpoint. Using a conservative page size avoids
// hitting any server-side max-limit cap that could otherwise return an error.
async function fetchAllPages(path, label){
  const pageSize = 100;
  let offset = 0;
  let out = [];
  for(let i=0; i<50; i++){
    const url = `${API_BASE}${path}${path.includes('?') ? '&' : '?'}limit=${pageSize}&offset=${offset}`;
    let json;
    try{
      json = await fetchJson(url);
    }catch(err){
      throw new Error(`[${label}] ${err.message}`);
    }
    out = out.concat(json);
    if(json.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

// Loads everything the app needs from the API in one go.
async function apiLoadAll(){
  const [skillsRaw, armor, decorations, charms, armorSets] = await Promise.all([
    fetchAllPages('/skills', 'skills'),
    fetchAllPages('/armor', 'armor'),
    fetchAllPages('/decorations', 'decorations'),
    fetchAllPages('/charms', 'charms'),
    fetchAllPages('/armor/sets', 'armor-sets'),
  ]);
  return { skillsRaw, armor, decorations, charms, armorSets };
}
