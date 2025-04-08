// src/sendMessage.ts

import { db } from "./firebaseConfig"; 
import { doc, setDoc } from "firebase/firestore";

document.getElementById("msgForm")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msgInput = document.getElementById("messageInput") as HTMLTextAreaElement;
  const msg = msgInput.value.trim();
  if (!msg) {
    alert("Ingresa un mensaje");
    return;
  }

  try {
    // Actualizamos UN documento de "control/session1" 
    // con flowState="triggered" y guardamos el 'message'
    const controlRef = doc(db, "control", "session1");
    await setDoc(controlRef, {
      flowState: "triggered",
      message: msg
    }, { merge: true });
    
    alert("Mensaje enviado. Observa la pantalla principal.");
    msgInput.value = "";
  } catch (err) {
    console.error("Error guardando mensaje:", err);
    alert("No se pudo enviar tu mensaje.");
  }
});
