"use strict";

/*
 * Culinary Chemestry
 * Lógica principal del chat y comunicación con Make.
 */

const MAX_LENGTH = 500;
const MIN_DELAY = 1500;
const TIMEOUT = 30000;

const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const chat = document.getElementById("zona-de-chat");
const characterCount = document.getElementById("character-count");

let sessionId = obtenerSessionId();
let ultimoEnvio = 0;
let mensajeInicial = true;

/**
 * Obtiene o crea un identificador único de sesión.
 * Se crea una sola vez y luego se reutiliza.
 */
function obtenerSessionId() {
  const clave = "culinaryChemestrySessionId";

  try {
    const guardado = localStorage.getItem(clave);

    if (guardado) {
      return guardado;
    }

    const nuevoId = crearId();

    localStorage.setItem(clave, nuevoId);

    return nuevoId;
  } catch (error) {
    // Si localStorage no está disponible, se conserva en memoria.
    return crearId();
  }
}

/**
 * Genera un ID usando crypto.randomUUID().
 * Tiene una alternativa para navegadores que no lo soporten.
 */
function crearId() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Agrega un mensaje al chat usando exclusivamente textContent.
 */
function agregarMensaje(texto, tipo) {
  const mensaje = document.createElement("div");

  mensaje.classList.add("message", tipo);
  mensaje.textContent = texto;

  chat.appendChild(mensaje);
  chat.scrollTop = chat.scrollHeight;

  return mensaje;
}

/**
 * Elimina la tarjeta inicial cuando el usuario empieza a conversar.
 */
function quitarBienvenida() {
  if (!mensajeInicial) {
    return;
  }

  const bienvenida = chat.querySelector(".welcome-card");

  if (bienvenida) {
    bienvenida.remove();
  }

  mensajeInicial = false;
}

/**
 * Actualiza el contador de caracteres.
 */
function actualizarContador() {
  characterCount.textContent = `${input.value.length} / ${MAX_LENGTH}`;
}

/**
 * Ajusta automáticamente la altura del textarea.
 */
function ajustarAltura() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
}

/**
 * Verifica que el mensaje tenga una longitud válida.
 */
function validarMensaje(mensaje) {
  if (!mensaje) {
    return "Escribí un mensaje antes de enviarlo.";
  }

  if (mensaje.length > MAX_LENGTH) {
    return `El mensaje no puede superar los ${MAX_LENGTH} caracteres.`;
  }

  return null;
}

/**
 * Comprueba si el webhook está configurado.
 */
function webhookConfigurado() {
  return (
    typeof WEBHOOK_URL === "string" &&
    WEBHOOK_URL.trim() !== "" &&
    !WEBHOOK_URL.includes("ACA VA")
  );
}

/**
 * Espera una cantidad determinada de milisegundos.
 */
function esperar(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Obtiene la respuesta de Make según el contrato indicado.
 */
function interpretarRespuesta(texto) {
  if (!texto || !texto.trim()) {
    return "(respuesta vacía)";
  }

  try {
    const datos = JSON.parse(texto);

    if (
      datos &&
      typeof datos === "object" &&
      !Array.isArray(datos)
    ) {
      const propiedades = [
        "response",
        "respuesta",
        "message",
        "mensaje"
      ];

      for (const propiedad of propiedades) {
        if (
          typeof datos[propiedad] === "string" &&
          datos[propiedad].trim() !== ""
        ) {
          return datos[propiedad];
        }
      }

      return "Make respondió, pero sin el campo response";
    }

    return texto;
  } catch (error) {
    // Si no es JSON válido, se muestra exactamente el texto recibido.
    return texto;
  }
}

/**
 * Envía el mensaje al webhook de Make.
 */
async function enviarMensaje(mensaje) {
  const ahora = Date.now();
  const tiempoDesdeUltimoEnvio = ahora - ultimoEnvio;

  if (tiempoDesdeUltimoEnvio < MIN_DELAY) {
    await esperar(MIN_DELAY - tiempoDesdeUltimoEnvio);
  }

  ultimoEnvio = Date.now();

  if (!webhookConfigurado()) {
    agregarMensaje(
      "Falta pegar la URL de tu webhook en config.js",
      "error"
    );
    return;
  }

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TIMEOUT);

  try {
    const fecha = new Date().toISOString();

    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId,
        mensaje,
        fecha
      }),
      signal: controller.signal
    });

    const textoRespuesta = await respuesta.text();

    if (!respuesta.ok) {
      agregarMensaje(
        `Make respondió con error (código ${respuesta.status}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`,
        "error"
      );
      return;
    }

    const respuestaFinal = interpretarRespuesta(textoRespuesta);

    agregarMensaje(respuestaFinal, "agent");
  } catch (error) {
    if (error.name === "AbortError") {
      agregarMensaje(
        "La respuesta tardó demasiado. Se agotó el tiempo de espera de 30 segundos.",
        "error"
      );
      return;
    }

    if (error instanceof TypeError) {
      agregarMensaje(
        "No se pudo conectar con Make. Revisá la URL del webhook y tu conexión a Internet.",
        "error"
      );
      return;
    }

    agregarMensaje(
      "Ocurrió un error inesperado al comunicarse con Make.",
      "error"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Maneja el envío del formulario.
 */
async function manejarEnvio(evento) {
  evento.preventDefault();

  const mensaje = input.value.trim();
  const error = validarMensaje(mensaje);

  if (error) {
    agregarMensaje(error, "error");
    return;
  }

  quitarBienvenida();

  agregarMensaje(mensaje, "user");

  input.value = "";
  actualizarContador();
  ajustarAltura();

  input.disabled = true;
  sendButton.disabled = true;

  const mensajeCargando = agregarMensaje(
    "Analizando tu idea culinaria...",
    "agent"
  );

  try {
    await enviarMensaje(mensaje);
  } finally {
    /*
     * Se elimina siempre el estado de carga.
     * La respuesta real ya fue agregada por enviarMensaje().
     */
    if (mensajeCargando && mensajeCargando.parentNode) {
      mensajeCargando.remove();
    }

    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
  }
}

/**
 * Permite enviar con Enter.
 * Shift + Enter agrega una nueva línea.
 */
function manejarTeclado(evento) {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    form.requestSubmit();
  }
}

/**
 * Permite usar las sugerencias iniciales.
 */
function configurarSugerencias() {
  const sugerencias = document.querySelectorAll(".suggestion");

  sugerencias.forEach((boton) => {
    boton.addEventListener("click", () => {
      input.value = boton.textContent.trim();
      actualizarContador();
      ajustarAltura();
      input.focus();
    });
  });
}

/* Eventos */
form.addEventListener("submit", manejarEnvio);
input.addEventListener("input", () => {
  actualizarContador();
  ajustarAltura();
});

input.addEventListener("keydown", manejarTeclado);

configurarSugerencias();
actualizarContador();
