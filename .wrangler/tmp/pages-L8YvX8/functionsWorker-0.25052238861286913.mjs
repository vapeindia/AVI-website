var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/harassment-report.js
var WHAT_HAPPENED = /* @__PURE__ */ new Set(["device_confiscated", "cash_demanded", "detained", "threatened_only", "other"]);
var DEVICE_RETURNED = /* @__PURE__ */ new Set(["yes", "no", "partial", "na"]);
var OFFICER_IDENTIFIED = /* @__PURE__ */ new Set(["yes", "no", "refused"]);
var MAX_LEN = { city: 60, details: 1e3, email: 200 };
var MAX_AMOUNT = 1e6;
var EARLIEST_DATE = /* @__PURE__ */ new Date("2016-01-01T00:00:00.000Z");
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
__name(utf8ToBase64, "utf8ToBase64");
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
__name(isValidEmail, "isValidEmail");
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}
__name(slugify, "slugify");
function toFrontmatter(fields) {
  const submittedAt = (/* @__PURE__ */ new Date()).toISOString();
  return `---
date: ${fields.date}
city: ${JSON.stringify(fields.city)}
whatHappened: ${JSON.stringify(fields.whatHappened)}
amount: ${fields.amount}
deviceReturned: ${JSON.stringify(fields.deviceReturned)}
officerIdentified: ${JSON.stringify(fields.officerIdentified)}
willingToHelp: ${fields.willingToHelp}
submittedAt: ${JSON.stringify(submittedAt)}
---
`;
}
__name(toFrontmatter, "toFrontmatter");
async function commitReport(env, fields) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.log("Skipping GitHub commit: GITHUB_TOKEN or GITHUB_REPO not configured.");
    return { skipped: true };
  }
  const branch = env.GITHUB_BRANCH || "main";
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "avi-site-harassment-report-function"
  };
  const id = crypto.randomUUID().slice(0, 8);
  const path = `src/content/harassment-reports/${fields.date}-${slugify(fields.city)}-${id}.md`;
  const content = toFrontmatter(fields);
  const putRes = await fetch(`${api}/contents/${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Harassment report: ${fields.city}, ${fields.date}`,
      content: utf8ToBase64(content),
      branch
    })
  });
  if (!putRes.ok) throw new Error(`file create failed: ${putRes.status} ${await putRes.text()}`);
  return { skipped: false };
}
__name(commitReport, "commitReport");
async function notifyTeam(env, fields, { email, details }) {
  if (!fields.willingToHelp && !details && !email) return { skipped: true, reason: "nothing to follow up on" };
  if (!env.RESEND_API_KEY) {
    console.log("Skipping team notification: RESEND_API_KEY not configured.");
    return { skipped: true };
  }
  const from = env.RESEND_FROM || "AVI <contact@vapeindia.org>";
  const to = env.NOTIFY_EMAIL || "contact@vapeindia.org";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New harassment report \u2014 ${fields.city}, ${fields.date}${fields.willingToHelp ? " (willing to help)" : ""}`,
      text: `New police harassment report submitted via vapeindia.org/report-harassment.

City: ${fields.city}
Date of incident: ${fields.date}
What happened: ${fields.whatHappened.join(", ")}
Amount demanded/paid: ${fields.amount ? `\u20B9${fields.amount}` : "none reported"}
Device returned: ${fields.deviceReturned}
Officer identified themselves: ${fields.officerIdentified}
Willing to be contacted re: legal support: ${fields.willingToHelp ? "YES" : "no"}

Email (private \u2014 reply here to reach them, not published anywhere): ${email || "(not given)"}

Details the submitter added:
${details || "(none)"}

This report has already been committed to the site as an anonymous,
aggregate-only entry \u2014 this email is the only place any contact info or
free text from it exists.`
    })
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  return { skipped: false };
}
__name(notifyTeam, "notifyTeam");
async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return jsonResponse({ ok: true });
  }
  const date = String(body.date || "").trim().slice(0, 10);
  const parsedDate = /* @__PURE__ */ new Date(`${date}T00:00:00.000Z`);
  const today = /* @__PURE__ */ new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (!date || Number.isNaN(parsedDate.valueOf()) || parsedDate < EARLIEST_DATE || parsedDate > today) {
    return jsonResponse({ error: "Invalid date" }, 400);
  }
  let city = String(body.city || "").trim().slice(0, MAX_LEN.city);
  if (!city) return jsonResponse({ error: "City is required" }, 400);
  const whatHappened = Array.isArray(body.whatHappened) ? [...new Set(body.whatHappened.map(String).filter((v) => WHAT_HAPPENED.has(v)))] : [];
  if (whatHappened.length === 0) return jsonResponse({ error: "Select at least one option for what happened" }, 400);
  const amount = Number(body.amount) || 0;
  if (amount < 0 || amount > MAX_AMOUNT) return jsonResponse({ error: "Invalid amount" }, 400);
  const deviceReturned = String(body.deviceReturned || "");
  if (!DEVICE_RETURNED.has(deviceReturned)) return jsonResponse({ error: "Invalid deviceReturned value" }, 400);
  const officerIdentified = String(body.officerIdentified || "");
  if (!OFFICER_IDENTIFIED.has(officerIdentified)) return jsonResponse({ error: "Invalid officerIdentified value" }, 400);
  const willingToHelp = Boolean(body.willingToHelp);
  const email = String(body.email || "").trim().slice(0, MAX_LEN.email);
  if (email && !isValidEmail(email)) return jsonResponse({ error: "Invalid email" }, 400);
  const details = String(body.details || "").trim().slice(0, MAX_LEN.details);
  const fields = { date, city, whatHappened, amount, deviceReturned, officerIdentified, willingToHelp };
  let commitError = null;
  let notifyError = null;
  try {
    await commitReport(env, fields);
  } catch (err) {
    commitError = err;
    console.error("Harassment report commit failed:", err);
  }
  try {
    await notifyTeam(env, fields, { email, details });
  } catch (err) {
    notifyError = err;
    console.error("Harassment report team notification failed:", err);
  }
  if (commitError && (willingToHelp || details || email) && notifyError) {
    return jsonResponse({ error: "Submission could not be processed. Please try again later." }, 502);
  }
  if (commitError) {
    return jsonResponse({ error: "Submission could not be processed. Please try again later." }, 502);
  }
  return jsonResponse({ ok: true });
}
__name(onRequestPost, "onRequestPost");
async function onRequestGet() {
  return jsonResponse({ error: "Method not allowed" }, 405);
}
__name(onRequestGet, "onRequestGet");

// api/testimonial.js
var MAX_LEN2 = { testimonial: 2e3, name: 100, location: 100, email: 200 };
function slugify2(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}
__name(slugify2, "slugify");
function utf8ToBase642(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
__name(utf8ToBase642, "utf8ToBase64");
function isValidEmail2(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
__name(isValidEmail2, "isValidEmail");
function jsonResponse2(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
__name(jsonResponse2, "jsonResponse");
function toFrontmatter2({ name, location, testimonial }) {
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return `---
name: ${JSON.stringify(name)}
location: ${JSON.stringify(location)}
date: ${date}
testimonial: ${JSON.stringify(testimonial)}
reviewed: false
featured: false
---
`;
}
__name(toFrontmatter2, "toFrontmatter");
async function openTestimonialPR(env, { name, location, testimonial }) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.log("Skipping GitHub PR: GITHUB_TOKEN or GITHUB_REPO not configured.");
    return { skipped: true };
  }
  const baseBranch = env.GITHUB_BRANCH || "main";
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "avi-site-testimonial-function"
  };
  const refRes = await fetch(`${api}/git/ref/heads/${baseBranch}`, { headers });
  if (!refRes.ok) throw new Error(`git ref lookup failed: ${refRes.status} ${await refRes.text()}`);
  const refJson = await refRes.json();
  const baseSha = refJson.object.sha;
  const branch = `auto/testimonial-${Date.now()}-${slugify2(name)}`;
  const createRefRes = await fetch(`${api}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
  });
  if (!createRefRes.ok) {
    throw new Error(`branch create failed: ${createRefRes.status} ${await createRefRes.text()}`);
  }
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const path = `src/content/testimonials/_inbox/${date}-${slugify2(name)}.md`;
  const content = toFrontmatter2({ name, location, testimonial });
  const putRes = await fetch(`${api}/contents/${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Testimonial: add submission from ${name} (${location})`,
      content: utf8ToBase642(content),
      branch
    })
  });
  if (!putRes.ok) throw new Error(`file create failed: ${putRes.status} ${await putRes.text()}`);
  const prRes = await fetch(`${api}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `New testimonial \u2014 ${name}, ${location}`,
      head: branch,
      base: baseBranch,
      body: [
        "A visitor submitted a testimonial through /testimonials.",
        "",
        "**Review checklist before approving:**",
        "- [ ] Reads as a genuine, specific account (not spam or promotional)",
        "- [ ] No product brand names, purchase links, or vendor mentions (PECA advertising risk)",
        "- [ ] Name and location are plausible and not obviously fake",
        "",
        "Flip `reviewed: true` (and optionally move the file out of `_inbox/`) to publish."
      ].join("\n")
    })
  });
  if (!prRes.ok) throw new Error(`PR create failed: ${prRes.status} ${await prRes.text()}`);
  const prJson = await prRes.json();
  return { skipped: false, url: prJson.html_url };
}
__name(openTestimonialPR, "openTestimonialPR");
async function sendThankYouEmail(env, { name, email }) {
  if (!env.RESEND_API_KEY) {
    console.log("Skipping thank-you email: RESEND_API_KEY not configured.");
    return { skipped: true };
  }
  const from = env.RESEND_FROM || "AVI <contact@vapeindia.org>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Thank you for sharing your story with AVI",
      text: `Hi ${name},

Thank you for sharing your testimonial with the Association of Vapers India.

Stories like yours are one of the most powerful tools we have to show
policymakers and the public what safer nicotine products actually mean for
Indians who smoke. A member of our team reads every submission, and yours
will appear on vapeindia.org/testimonials once it's been reviewed.

If you have any questions in the meantime, just reply to this email or
write to us at contact@vapeindia.org.

With thanks,
Association of Vapers India
vapeindia.org`
    })
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  return { skipped: false };
}
__name(sendThankYouEmail, "sendThankYouEmail");
async function notifyTeam2(env, { name, location, testimonial, email, prUrl }) {
  if (!env.RESEND_API_KEY) {
    console.log("Skipping team notification: RESEND_API_KEY not configured.");
    return { skipped: true };
  }
  const from = env.RESEND_FROM || "AVI <contact@vapeindia.org>";
  const to = env.NOTIFY_EMAIL || "contact@vapeindia.org";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New testimonial submission \u2014 ${name}, ${location}`,
      text: `New testimonial submitted via vapeindia.org/testimonials.

Name: ${name}
Location: ${location}
Email (private \u2014 reply here to reach them, not published anywhere): ${email}

Testimonial:
${testimonial}

Review PR: ${prUrl || "(not opened \u2014 see function logs for why)"}`
    })
  });
  if (!res.ok) throw new Error(`Team notify failed: ${res.status} ${await res.text()}`);
  return { skipped: false };
}
__name(notifyTeam2, "notifyTeam");
async function onRequestPost2({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse2({ error: "Invalid JSON body" }, 400);
  }
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return jsonResponse2({ ok: true });
  }
  const name = String(body.name || "").trim().slice(0, MAX_LEN2.name);
  const location = String(body.location || "").trim().slice(0, MAX_LEN2.location);
  const testimonial = String(body.testimonial || "").trim().slice(0, MAX_LEN2.testimonial);
  const email = String(body.email || "").trim().slice(0, MAX_LEN2.email);
  if (!name || !location || !testimonial || !email) {
    return jsonResponse2({ error: "Missing required field" }, 400);
  }
  if (!isValidEmail2(email)) {
    return jsonResponse2({ error: "Invalid email" }, 400);
  }
  const results = { pr: null, email: null };
  let prError = null;
  let emailError = null;
  try {
    results.pr = await openTestimonialPR(env, { name, location, testimonial });
  } catch (err) {
    prError = err;
    console.error("Testimonial PR failed:", err);
  }
  try {
    results.email = await sendThankYouEmail(env, { name, email });
  } catch (err) {
    emailError = err;
    console.error("Thank-you email failed:", err);
  }
  try {
    await notifyTeam2(env, { name, location, testimonial, email, prUrl: results.pr?.url });
  } catch (err) {
    console.error("Team notification failed:", err);
  }
  if (prError && emailError) {
    return jsonResponse2({ error: "Submission could not be processed. Please try again later." }, 502);
  }
  return jsonResponse2({ ok: true });
}
__name(onRequestPost2, "onRequestPost");
async function onRequestGet2() {
  return jsonResponse2({ error: "Method not allowed" }, 405);
}
__name(onRequestGet2, "onRequestGet");

// ../.wrangler/tmp/pages-L8YvX8/functionsRoutes-0.8314275440969563.mjs
var routes = [
  {
    routePath: "/api/harassment-report",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/harassment-report",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/testimonial",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/testimonial",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  }
];

// ../../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-38Pws4/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-38Pws4/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.25052238861286913.mjs.map
