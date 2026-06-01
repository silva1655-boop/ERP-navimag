import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
const firebaseConfig = {
  apiKey: "AIzaSyAGYsVTMOVfklVkZ1Kzpld7mEEIIoISAtw",
  authDomain: "man-navimag.firebaseapp.com",
  projectId: "man-navimag",
  storageBucket: "man-navimag.firebasestorage.app",
  messagingSenderId: "873554402392",
  appId: "1:873554402392:web:586c5ce9c79f9dc44c7e2d",
  measurementId: "G-PCSE0QLBFV"
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
