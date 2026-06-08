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
const config = firebaseConfig as any;
export const db = getFirestore(app, config.firestoreDatabaseId || 'ai-studio-69a653c2-f279-40ef-a977-9be443b34f45');
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
    console.warn("Firebase connection test failed (expected if database is not initialized yet):", error.message || error);
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
