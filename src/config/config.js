export const MATERNA_URL = "https://snitch-deviancy-giddily.ngrok-free.dev";
// Set this to false to use live readings from the Materna server.
export const DEMO_MODE = true;
export const DOCTOR_CREDENTIALS = "ZG9jdG9yOm1hdGVybmFhaTIwMjQ=";

export const BASE_HEADERS = {
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

export const DOCTOR_HEADERS = {
  ...BASE_HEADERS,
  Authorization: `Basic ${DOCTOR_CREDENTIALS}`,
};
