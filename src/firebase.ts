import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCQklb581etGne04VWMQeFt_-Di_QB0jYY",
  authDomain: "merit-ems.firebaseapp.com",
  projectId: "merit-ems",
  storageBucket: "merit-ems.firebasestorage.app",
  messagingSenderId: "541889581184",
  appId: "1:541889581184:web:207f06706db10d5252d665",
  measurementId: "G-RQBZ570FNW"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);