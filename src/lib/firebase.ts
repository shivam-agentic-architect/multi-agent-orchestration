import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

/**
 * Validate Firestore connection on boot
 */
async function testConnection() {
  try {
    // Attempt to refer to a dummy doc to check connection
    await getDocFromServer(doc(db, '_internal', 'connectivity_check'));
  } catch (error: any) {
    if (error?.message?.includes('offline')) {
      console.warn("Firestore appears to be offline. Check Firebase configuration.");
    }
  }
}

testConnection();
