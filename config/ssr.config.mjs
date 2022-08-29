export const port = "3001";
export const proxy = {
  "/api": {
    target: "http://localhost:4000",
    changeOrigin: true,
  },
};
