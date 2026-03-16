import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
    apiKey: "AIzaSyALFCoM4kOHcoIZf7QEMwrmHB7fv_HTZSA",
    authDomain: "lionbaker-vc.firebaseapp.com",
    projectId: "lionbaker-vc",
    storageBucket: "lionbaker-vc.firebasestorage.app",
    messagingSenderId: "993420492969",
    appId: "1:993420492969:web:d9175c7e110096cee4e9b8",
    measurementId: "G-631VQDLC4C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Use initializeFirestore to fix "client is offline" errors sometimes caused by strict mode / multiple instances in dev
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false
});
const storage = getStorage(app);
const functions = getFunctions(app);

// Auth helper: reuse existing session or sign in anonymously
export const signIn = () => {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            unsubscribe(); // Stop listening
            if (user) {
                resolve(user); // Already signed in (Google or Anonymous)
            } else {
                try {
                    const result = await signInAnonymously(auth);
                    resolve(result.user);
                } catch (error) {
                    console.error("Auth Error", error);
                    if (error.code === 'auth/admin-restricted-operation') {
                        alert("【系統設定錯誤】請至 Firebase Console 開啟「匿名登入 (Anonymous)」功能。");
                    }
                    reject(error);
                }
            }
        });
    });
};

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Google Auth Error", error);
        throw error;
    }
};

export const logOut = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error", error);
        throw error;
    }
};

export { auth, db, storage, functions, googleProvider };
