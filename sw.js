/* Offline app shell. Cloud data still requires an internet connection. */
const CACHE = 'daymark-cloud-v6-task-switch';
const SHELL = ['./','./index.html','./cloud.js','./firebase-config.js','./manifest.webmanifest','./icons/daymark-192.png','./icons/daymark-512.png'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET') return;
 const url = new URL(event.request.url);
 if (url.origin!==self.location.origin) return;
 event.respondWith(fetch(event.request).then(response=>{
   if(response.ok) {const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone))}
   return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached || (event.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
