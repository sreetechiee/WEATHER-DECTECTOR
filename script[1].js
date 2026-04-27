/**
 * script.js — Atmos Weather Dashboard
 * ─────────────────────────────────────────────────────────────
 * Architecture: Module-style IIFE to avoid polluting global scope.
 *
 * Flow:
 *  1. User enters city → fetchWeather() called
 *  2. Real OpenWeatherMap API attempted (requires YOUR_API_KEY)
 *  3. If key is absent/invalid → fallback to richMockData()
 *  4. renderUI() populates the DOM and triggers CSS animations
 * ─────────────────────────────────────────────────────────────
 */

(() => {
  'use strict';

  /* ── CONFIGURATION ─────────────────────────────────────────── */
  /**
   * Replace 'YOUR_API_KEY' with your key from openweathermap.org
   * Free tier is sufficient (Current Weather + UV Index endpoints).
   * When the key is absent, the app automatically uses mock data
   * so the UI can still be demoed offline.
   */
  const CONFIG = {
    API_KEY:   'YOUR_API_KEY',
    BASE_URL:  'https://api.openweathermap.org/data/2.5',
    UV_URL:    'https://api.openweathermap.org/data/2.5/uvi',
    UNITS:     'metric',   // 'imperial' for °F
    UNIT_LABEL: '°C',
  };

  /* ── DOM ELEMENT CACHE ─────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const DOM = {
    input:      $('city-input'),
    searchBtn:  $('search-btn'),
    errorMsg:   $('error-msg'),
    loader:     $('loader'),
    mainCard:   $('weather-main'),
    metricsGrid:$('metrics-grid'),
    cityName:   $('city-name'),
    date:       $('weather-date'),
    temp:       $('temperature'),
    icon:       $('weather-icon'),
    condition:  $('condition'),
    feelsLike:  $('feels-like'),
    decoEmoji:  $('deco-emoji'),
    humidity:   $('humidity'),
    wind:       $('wind-speed'),
    uv:         $('uv-index'),
    humidBar:   $('humidity-bar'),
    windBar:    $('wind-bar'),
    uvBar:      $('uv-bar'),
  };

  /* ── EMOJI MAP ─────────────────────────────────────────────── */
  /**
   * Maps OpenWeatherMap main condition strings to decorative emojis.
   * Used for the large ambient icon on the main card.
   */
  const EMOJI_MAP = {
    Clear:        '☀️',
    Clouds:       '☁️',
    Rain:         '🌧️',
    Drizzle:      '🌦️',
    Thunderstorm: '⛈️',
    Snow:         '❄️',
    Mist:         '🌫️',
    Fog:          '🌫️',
    Haze:         '🌁',
    Dust:         '💨',
    Sand:         '🏜️',
    Ash:          '🌋',
    Squall:       '💨',
    Tornado:      '🌪️',
  };

  /* ── MOCK DATA (offline / no-key fallback) ─────────────────── */
  /**
   * Returns a rich mock-data object that mirrors the shape of
   * data our renderUI() function expects, so the app is fully
   * functional even without an API key during demos.
   */
  const getMockData = city => ({
    cityName:   city || 'San Francisco',
    country:    'US',
    temp:       18,
    feelsLike:  16,
    condition:  'Partly Cloudy',
    conditionMain: 'Clouds',
    iconCode:   '02d',
    humidity:   72,
    windSpeed:  14,
    uvIndex:    4.2,
  });

  /* ── FETCH LOGIC ───────────────────────────────────────────── */
  /**
   * fetchWeather(city)
   * ──────────────────
   * Orchestrates two API calls:
   *   (a) Current Weather → temperature, humidity, wind, condition
   *   (b) UV Index        → separate endpoint using lat/lon from (a)
   *
   * Both calls are awaited with Promise.all for efficiency.
   * On any failure (network, bad key, city not found) we fall
   * back to mock data so the demo never breaks.
   */
  const fetchWeather = async city => {
    showLoader(true);
    clearError();

    /* Guard: no API key configured → skip live fetch */
    if (!CONFIG.API_KEY || CONFIG.API_KEY === 'YOUR_API_KEY') {
      console.info('[Atmos] No API key — using mock data for demo.');
      await simulateDelay(800);
      const mock = getMockData(city);
      renderUI(mock);
      showLoader(false);
      return;
    }

    try {
      /* ── (a) Current Weather ── */
      const weatherRes = await fetch(
        `${CONFIG.BASE_URL}/weather?q=${encodeURIComponent(city)}&units=${CONFIG.UNITS}&appid=${CONFIG.API_KEY}`
      );

      /* 404 → city not found; surface a friendly message */
      if (weatherRes.status === 404) {
        throw new Error(`City "${city}" not found. Please check the spelling.`);
      }
      if (!weatherRes.ok) {
        throw new Error(`API error: ${weatherRes.status} ${weatherRes.statusText}`);
      }

      const weatherData = await weatherRes.json();

      /* Destructure the fields we need from the OWM response shape */
      const { lat, lon } = weatherData.coord;

      /* ── (b) UV Index (uses lat/lon from weather response) ── */
      const uvRes = await fetch(
        `${CONFIG.UV_URL}?lat=${lat}&lon=${lon}&appid=${CONFIG.API_KEY}`
      );
      const uvData = await uvRes.json();

      /* Normalise into our own flat object for renderUI() */
      const payload = {
        cityName:      weatherData.name,
        country:       weatherData.sys.country,
        temp:          Math.round(weatherData.main.temp),
        feelsLike:     Math.round(weatherData.main.feels_like),
        condition:     weatherData.weather[0].description,
        conditionMain: weatherData.weather[0].main,
        iconCode:      weatherData.weather[0].icon,
        humidity:      weatherData.main.humidity,
        windSpeed:     Math.round(weatherData.wind.speed),
        uvIndex:       uvData.value ?? 0,
      };

      renderUI(payload);

    } catch (err) {
      console.error('[Atmos] Fetch failed:', err);
      showError(err.message || 'Something went wrong. Showing demo data.');
      /* Graceful degradation: always render something */
      renderUI(getMockData(city));

    } finally {
      showLoader(false);
    }
  };

  /* ── RENDER ────────────────────────────────────────────────── */
  /**
   * renderUI(data)
   * ──────────────
   * Takes our normalised payload and populates every DOM element.
   * Cards are revealed by removing the [hidden] attribute; the
   * CSS @keyframes (slide-up / fade-in) then fire automatically.
   * Fill bars are set via inline width so the CSS transition plays.
   */
  const renderUI = data => {
    /* ── Main card ── */
    DOM.cityName.textContent  = `${data.cityName}, ${data.country}`;
    DOM.date.textContent      = formatDate(new Date());
    DOM.temp.textContent      = `${data.temp}${CONFIG.UNIT_LABEL}`;
    DOM.feelsLike.textContent = `Feels like ${data.feelsLike}${CONFIG.UNIT_LABEL}`;
    DOM.condition.textContent = data.condition;
    DOM.decoEmoji.textContent = EMOJI_MAP[data.conditionMain] ?? '🌡️';

    /* OWM icon URL — 2x for retina quality */
    DOM.icon.src = `https://openweathermap.org/img/wn/${data.iconCode}@2x.png`;
    DOM.icon.alt = data.condition;

    /* Reveal main card (triggers slide-up animation via CSS) */
    DOM.mainCard.hidden = false;

    /* ── Metric cards ── */
    DOM.humidity.textContent  = `${data.humidity}%`;
    DOM.wind.textContent      = `${data.windSpeed} km/h`;
    DOM.uv.textContent        = data.uvIndex.toFixed(1);

    DOM.metricsGrid.hidden = false;

    /* Animated fill bars:
       Clamp each value to 0–100 for the width percentage.
       Wind capped at 120 km/h as "full bar"; UV capped at 11 (extreme). */
    requestAnimationFrame(() => {
      DOM.humidBar.style.width = `${clamp(data.humidity, 0, 100)}%`;
      DOM.windBar.style.width  = `${clamp((data.windSpeed / 120) * 100, 0, 100)}%`;
      DOM.uvBar.style.width    = `${clamp((data.uvIndex  / 11)  * 100, 0, 100)}%`;
    });
  };

  /* ── HELPERS ───────────────────────────────────────────────── */

  /** Format date as "Monday, 26 April 2026" */
  const formatDate = d =>
    d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  /** Clamp a value between min and max */
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  /** Artificial delay to make the loader visible during mock demos */
  const simulateDelay = ms => new Promise(r => setTimeout(r, ms));

  const showLoader = show => { DOM.loader.hidden = !show; };
  const showError  = msg  => { DOM.errorMsg.textContent = msg; };
  const clearError = ()   => { DOM.errorMsg.textContent = ''; };

  /* ── EVENT LISTENERS ───────────────────────────────────────── */

  /** Button click */
  DOM.searchBtn.addEventListener('click', () => {
    const city = DOM.input.value.trim();
    if (!city) { showError('Please enter a city name.'); return; }
    fetchWeather(city);
  });

  /** Enter key in search box */
  DOM.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') DOM.searchBtn.click();
  });

  /* ── INITIAL LOAD ──────────────────────────────────────────── */
  /** Load a default city on first render for a polished first impression */
  fetchWeather('London');

})();
