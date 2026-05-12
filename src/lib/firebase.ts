import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Connection test helper
export const checkConnection = async () => {
  try {
    // We try to fetch a document that usually exists (or doesn't) to check connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error: any) {
    // If the error code includes "permission-denied", it means we ARE connected 
    // to Firebase, but the security rules are doing their job blocking unauth access.
    if (error.code === 'permission-denied' || (error.message && error.message.includes('permission'))) {
      return true;
    }
    console.error("Firebase connection test failed:", error);
    return false;
  }
};

export { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail 
};

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};
