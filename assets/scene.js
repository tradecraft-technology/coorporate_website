(() => {
  "use strict";

  const hero = document.querySelector(".hero");
  const scene = document.querySelector("#hero-scene");
  const image = document.querySelector("#landscape-image");
  const canvas = document.querySelector("#breeze-canvas");
  const toggle = document.querySelector("#motion-toggle");
  if (!hero || !scene || !image || !canvas || !toggle) return;

  const label = toggle.querySelector("[data-motion-label]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  let userPaused = false;
  let reducedMotionOverride = false;
  let onScreen = true;
  let running = false;
  let breeze = null;
  let frame = 0;
  let lastFrame = 0;
  let lastPaint = 0;
  let elapsed = 0;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  const vertexSource = `
    precision __PRECISION__ float;
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision __PRECISION__ float;
    uniform sampler2D u_image;
    uniform vec4 u_crop;
    uniform vec2 u_pixel;
    uniform float u_time;
    uniform float u_strength;
    varying vec2 v_uv;

    void main() {
      // Masks use top-origin artwork coordinates, independent of cover cropping.
      vec2 uv = u_crop.xy + vec2(v_uv.x, 1.0 - v_uv.y) * u_crop.zw;
      float canopy = smoothstep(0.38, 0.55, uv.x)
        * (1.0 - smoothstep(0.24, 0.36, uv.y));
      float plants = (1.0 - smoothstep(0.22, 0.35, uv.x))
        * smoothstep(0.57, 0.70, uv.y)
        * (1.0 - smoothstep(0.91, 1.0, uv.y));
      // Only the outer tree line moves; roofs and the workbench stay solid.
      float distant = smoothstep(0.43, 0.48, uv.y)
        * (1.0 - smoothstep(0.60, 0.66, uv.y))
        * ((1.0 - smoothstep(0.08, 0.17, uv.x))
          + smoothstep(0.91, 0.98, uv.x));

      float sway = sin(u_time * 0.47 + uv.x * 2.7)
        + 0.27 * sin(u_time * 0.79 + uv.y * 4.0);
      float flutter = sin(u_time * 1.65 + uv.x * 70.0 + uv.y * 38.0)
        * sin(u_time * 0.81 + uv.y * 84.0);
      vec2 wind = vec2(
        (1.65 * sway + 0.32 * flutter) * canopy
          + (1.15 * sway + 0.22 * flutter) * plants
          + 0.20 * sway * distant,
        (0.55 * sin(u_time * 0.39 + uv.x * 3.0) + 0.08 * flutter)
          * canopy + 0.13 * sway * plants
      );

      uv += wind * u_pixel * u_strength;
      // The uploaded texture is flipped; convert top-origin artwork UVs back.
      gl_FragColor = texture2D(u_image, vec2(uv.x, 1.0 - uv.y));
    }
  `;

  function createBreeze() {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return null;

    const highPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const precision = highPrecision && highPrecision.precision > 0 ? "highp" : "mediump";
    const shaders = [];
    const program = gl.createProgram();
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    let ready = false;
    let sized = false;

    function destroy() {
      shaders.forEach((shader) => gl.deleteShader(shader));
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
    }

    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragmentSource],
      ]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source.replace("__PRECISION__", precision));
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error("Breeze shader unavailable");
        }
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Breeze program unavailable");
      }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
      ]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);

      const crop = gl.getUniformLocation(program, "u_crop");
      const pixel = gl.getUniformLocation(program, "u_pixel");
      const strength = gl.getUniformLocation(program, "u_strength");
      const time = gl.getUniformLocation(program, "u_time");

      return {
        destroy,
        resize() {
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          sized = width > 0 && height > 0;
          if (!sized) return;
          // Preserve Retina detail, with a pixel budget for oversized displays.
          const dpr = Math.min(devicePixelRatio || 1, Math.sqrt(9_000_000 / (width * height)));
          canvas.width = Math.max(1, Math.round(width * dpr));
          canvas.height = Math.max(1, Math.round(height * dpr));
          gl.viewport(0, 0, canvas.width, canvas.height);

          // Match the static image's object-fit: cover and horizontal position.
          const fit = Math.max(width / image.naturalWidth, height / image.naturalHeight);
          const visibleX = width / (image.naturalWidth * fit);
          const visibleY = height / (image.naturalHeight * fit);
          const configuredX = parseFloat(getComputedStyle(scene).getPropertyValue("--scene-position-x"));
          const positionX = Number.isFinite(configuredX) ? configuredX : 0.5;
          gl.uniform4f(crop, (1 - visibleX) * positionX, (1 - visibleY) * 0.5, visibleX, visibleY);
          gl.uniform2f(pixel, visibleX / width, visibleY / height);
          gl.uniform1f(strength, Math.min(1, width / 1600));
        },
        draw(seconds) {
          if (!sized) return;
          gl.uniform1f(time, seconds);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (!ready) {
            if (gl.getError() !== gl.NO_ERROR) throw new Error("Breeze rendering unavailable");
            ready = true;
            hero.dataset.breeze = "ready";
          }
        },
      };
    } catch (error) {
      destroy();
      throw error;
    }
  }

  function stopBreeze() {
    delete hero.dataset.breeze;
    if (breeze) breeze.destroy();
    breeze = null;
  }

  function paintBreeze(resize = false) {
    if (!breeze) return;
    try {
      if (resize) breeze.resize();
      breeze.draw(elapsed);
    } catch {
      stopBreeze();
    }
  }

  function writeParallax() {
    scene.style.setProperty("--scene-x", `${pointerX.toFixed(2)}px`);
    scene.style.setProperty("--scene-y", `${pointerY.toFixed(2)}px`);
  }

  function pointerUnsettled() {
    return Math.abs(targetX - pointerX) + Math.abs(targetY - pointerY) > 0.02;
  }

  function queueFrame() {
    if (running && !frame && (breeze || pointerUnsettled())) {
      frame = requestAnimationFrame(animate);
    }
  }

  function animate(now) {
    frame = 0;
    if (!running) return;
    if (lastFrame) elapsed += Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (now - lastPaint >= 1000 / 30) {
      lastPaint = now - ((now - lastPaint) % (1000 / 30));
      if (pointerUnsettled()) {
        pointerX += (targetX - pointerX) * 0.13;
        pointerY += (targetY - pointerY) * 0.13;
        writeParallax();
      }
      paintBreeze();
    }
    queueFrame();
  }

  function syncMotion() {
    const intentPaused = userPaused || (reducedMotion.matches && !reducedMotionOverride);
    running = !intentPaused && !document.hidden && onScreen;
    hero.dataset.motion = running ? "running" : "paused";
    toggle.setAttribute("aria-pressed", String(intentPaused));
    if (label) label.textContent = intentPaused ? "Play motion" : "Pause motion";
    if (reducedMotion.matches || !finePointer.matches) {
      pointerX = pointerY = targetX = targetY = 0;
      writeParallax();
    }
    if (!running) {
      cancelAnimationFrame(frame);
      frame = lastFrame = lastPaint = 0;
    } else {
      initializeBreeze();
      queueFrame();
    }
  }

  function initializeBreeze() {
    if (!running || breeze || !image.naturalWidth || !image.naturalHeight) return;
    try {
      breeze = createBreeze();
      paintBreeze(true);
      queueFrame();
    } catch {
      stopBreeze();
    }
  }

  toggle.addEventListener("click", () => {
    const intentPaused = userPaused || (reducedMotion.matches && !reducedMotionOverride);
    userPaused = !intentPaused;
    reducedMotionOverride = intentPaused && reducedMotion.matches;
    syncMotion();
  });
  toggle.hidden = false;

  hero.addEventListener("pointermove", (event) => {
    if (!running || reducedMotion.matches || !finePointer.matches || event.pointerType === "touch") return;
    const bounds = hero.getBoundingClientRect();
    targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12;
    targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 8;
    queueFrame();
  }, { passive: true });
  hero.addEventListener("pointerleave", () => {
    targetX = targetY = 0;
    queueFrame();
  });
  reducedMotion.addEventListener("change", () => {
    reducedMotionOverride = false;
    syncMotion();
  });
  finePointer.addEventListener("change", syncMotion);
  document.addEventListener("visibilitychange", syncMotion);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      syncMotion();
    }).observe(hero);
  }
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => paintBreeze(true)).observe(scene);
  } else {
    window.addEventListener("resize", () => paintBreeze(true), { passive: true });
  }
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    stopBreeze();
  });
  canvas.addEventListener("webglcontextrestored", initializeBreeze);
  image.addEventListener("error", stopBreeze);
  syncMotion();
  if (image.complete) initializeBreeze();
  else image.addEventListener("load", initializeBreeze, { once: true });
})();
