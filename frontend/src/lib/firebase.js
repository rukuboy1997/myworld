import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyDDh-sB60c7NbVfXvHGIIMKzZUTKo9X6V0',
  authDomain: 'fascoin-app.firebaseapp.com',
  projectId: 'fascoin-app',
  storageBucket: 'fascoin-app.firebasestorage.app',
  messagingSenderId: '280721450926',
  appId: '1:280721450926:web:eebac60cf7ae5e5bf7ca3f',
  measurementId: 'G-7H3TCXYC72',
  databaseURL: 'https://fascoin-app-default-rtdb.firebaseio.com',
};

const app = initializeApp(firebaseConfig);
export const firebaseDb = getDatabase(app);

/**
 * Canonical conversation ID — always the same regardless of who is sender/receiver.
 * e.g. convId('0xBBB', '0xAAA') === convId('0xAAA', '0xBBB') === '0xAAA_0xBBB'
 */
export function convId(addrA, addrB) {
  return [addrA, addrB].sort().join('_');
}

/**
 * Write the current user's presence to Firebase.
 * Called on heartbeat (every 30 s) from Layout.jsx.
 * Path: presence/{address} = { lastSeenAt: ISO string }
 */
export function updatePresence(address) {
  if (!address) return;
  set(ref(firebaseDb, `presence/${address}`), {
    lastSeenAt: new Date().toISOString(),
  }).catch(() => {});
}
