import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBU9-zE1rsuOMOkzRjZMe4Eh8JTbOObbeE",
  authDomain: "chatbot-15779.firebaseapp.com",
  projectId: "chatbot-15779",
  storageBucket: "chatbot-15779.firebasestorage.app",
  messagingSenderId: "807349084340",
  appId: "1:807349084340:web:dabce08e59b20ff24df7e1",
  measurementId: "G-074L5RTBHE",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
