import axios from "axios";
import LRU from "lru-cache";
import { inject } from "vue";

const cache = new LRU({
  max: 1000,
  ttl: 1000 * 60 * 10, // how long to live in ms
});
const isServer = import.meta.env.SSR;

const key = Symbol("request");

export function useRequest() {
  return inject(key);
}

export function createRequest(
  app,
  { token, UUID = "", host = "", platform = "" },
  { toast, modal, confirm },
  router
) {
  function errorHandle(err, reject) {
    if (isServer) {
      const error = new Error(`${err.title} | ${err.msg}`);
      reject(error);
    } else {
      if (err.msg.length > 30) {
        modal(err.title, err.msg, "error");
      } else {
        toast(err.msg, "error");
      }
    }
  }

  function requestHandle([err, res], reject) {
    if (err) {
      errorHandle(err, reject);
      return null;
    }
    if (res.code === 200) {
      return res.data || {};
    } else if (res.code === 401) {
      //    logout()
      // window.location.assign(window.location)
      router.push("/login");
    } else {
      errorHandle({ title: "Error!", msg: res.msg || res }, reject);
    }
    return null;
  }

  function request(
    url = "",
    params = {},
    method = "GET",
    contentType = "form",
    headers = {},
    responseType = "json"
  ) {
    method = method.toUpperCase();
    contentType === "form" &&
      (contentType = "application/x-www-form-urlencoded");
    contentType === "json" && (contentType = "application/json");
    contentType === "file" && (contentType = "multipart/form-data");
    const query = [];
    for (const k in params) {
      query.push(k + "=" + params[k]);
    }
    let qs = query.join("&");

    if ((method === "GET" || method === "CACHE") && query.length > 0) {
      url += (url.indexOf("?") < 0 ? "?" : "&") + qs;
    }

    const isPost =
      contentType !== "application/x-www-form-urlencoded" && method !== "GET";
    if (isPost) {
      qs = JSON.stringify(params);
    }

    const cacheKey = host.value + url;
    return new Promise((resolve, reject) => {
      if (cache.get(cacheKey) && method === "CACHE") {
        resolve(cache.get(cacheKey));
        return;
      }

      const options = {
        method: method === "CACHE" ? "GET" : method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${token.value}`,
          UUID: UUID.value,
          Platform: platform.value,
          "Content-Type": contentType,
          // Accept:"application/json", //default is */*
          ...headers,
        },
        credentials: "same-origin", //only same origin as calling script will send cookies to (is default ald)
        mode: "cors", //allow cross origin requests that adhere to CORS protocol, laravel API will enforce the CORS protocol
        cache: "default",
      };

      if (isPost) {
        options.body = qs;
      }
      console.log("request", `${host.value}/${url}`);
      fetch(`${host.value}${url}`).then(
        async (response) => {
          //if 404 or 500 will return false
          if (response.ok) {
            const resData = await response.json();
            if (method === "CACHE" && resData.code === 200) {
              cache.set(cacheKey, resData);
            }
            const res = requestHandle([null, resData], reject);
            resolve(res);
          } else {
            let errorMessage = "";
            if (response.status == 500) {
              errorMessage = (await response.json()).message;
            } else {
              errorMessage = await response.text();
            }

            const res = requestHandle(
              [
                {
                  title: `请求出错了：${response.status}`,
                  msg: `${url} === ${errorMessage}`,
                },
                null,
              ],
              reject
            );
            resolve(res);
          }
        },
        (err) => {
          let title = "请求失败";
          let msg = `${url} === 服务器遇到了一点问题，请稍后重试`;
          if ((err + "").indexOf("timeout") > -1) {
            title = "请求超时";
            msg = `${url} === 可能是当前网络较慢，或者服务器响应慢，请稍后重试`;
          }
          const res = requestHandle([{ title, msg }, null], reject);
          resolve(res);
        }
      );
    });
  }

  app.provide(key, request);
  return request;
}
