import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyALFCoM4kOHcoIZf7QEMwrmHB7fv_HTZSA",
    authDomain: "lionbaker-vc.firebaseapp.com",
    projectId: "lionbaker-vc",
    storageBucket: "lionbaker-vc.firebasestorage.app",
    messagingSenderId: "993420492969",
    appId: "1:993420492969:web:d9175c7e110096cee4e9b8",
    measurementId: "G-631VQDLC4C"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
signInAnonymously(auth).then(() => console.log('success')).catch(e => console.error(e));
