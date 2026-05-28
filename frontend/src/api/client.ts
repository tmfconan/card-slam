import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    // A 401 from the login flow itself means "bad credentials" — let the
    // login page render the error (and any captcha) instead of redirecting.
    const url: string = error.config?.url ?? "";
    const isAuthFlow = url.includes("/auth/login") || url.includes("/auth/captcha");
    if (error.response?.status === 401 && !isAuthFlow) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
