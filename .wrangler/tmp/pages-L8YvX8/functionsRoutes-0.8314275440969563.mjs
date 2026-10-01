import { onRequestGet as __api_harassment_report_js_onRequestGet } from "C:\\Users\\samra\\OneDrive\\Documents\\AVI Website\\avi-site-scaffold\\avi-site\\functions\\api\\harassment-report.js"
import { onRequestPost as __api_harassment_report_js_onRequestPost } from "C:\\Users\\samra\\OneDrive\\Documents\\AVI Website\\avi-site-scaffold\\avi-site\\functions\\api\\harassment-report.js"
import { onRequestGet as __api_testimonial_js_onRequestGet } from "C:\\Users\\samra\\OneDrive\\Documents\\AVI Website\\avi-site-scaffold\\avi-site\\functions\\api\\testimonial.js"
import { onRequestPost as __api_testimonial_js_onRequestPost } from "C:\\Users\\samra\\OneDrive\\Documents\\AVI Website\\avi-site-scaffold\\avi-site\\functions\\api\\testimonial.js"

export const routes = [
    {
      routePath: "/api/harassment-report",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_harassment_report_js_onRequestGet],
    },
  {
      routePath: "/api/harassment-report",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_harassment_report_js_onRequestPost],
    },
  {
      routePath: "/api/testimonial",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_testimonial_js_onRequestGet],
    },
  {
      routePath: "/api/testimonial",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_testimonial_js_onRequestPost],
    },
  ]