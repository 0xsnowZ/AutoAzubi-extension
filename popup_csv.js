/**
 * popup_csv.js — CSV export logic for AutoAzubi popup
 * Loaded before popup.js. Exposes: window.downloadCSV(data)
 */

/**
 * Download scraped data as a deduplicated, UTF-8 BOM CSV file.
 * Splits German addresses into Street/PLZ/City columns.
 * @param {Array<Object>} data - Array of scraped lead objects
 */
window.downloadCSV = function downloadCSV(data) {
  // ── Helper: decode HTML entities (e.g. &amp; → &) ──
  const decodeEl = document.createElement("textarea");
  function decodeEntities(str) {
    decodeEl.innerHTML = str;
    return decodeEl.value;
  }

  // ── Helper: split German address into Street / PLZ / City ──
  function splitAddress(raw) {
    const addr = (raw || "").trim();
    // Match: "Street Part, 12345, City Name" (three comma-separated — Aubi-Plus JSON-LD format)
    const threePartMatch = addr.match(/^(.+?),\s*(\d{5}),\s*(.+)$/);
    if (threePartMatch) {
      return {
        street: threePartMatch[1].trim(),
        plz: threePartMatch[2],
        city: threePartMatch[3].trim(),
      };
    }
    // Match: "Street Part, 12345 City Name" or "Street Part, 12345 City, Region"
    const match = addr.match(/^(.+?),\s*(\d{5})\s+(.+)$/);
    if (match) {
      return { street: match[1].trim(), plz: match[2], city: match[3].trim() };
    }
    // Match: "Street Part 12345 City" (no comma — DasÖrtliche format)
    const noComma = addr.match(/^(.+?)\s+(\d{5})\s+(.+)$/);
    if (noComma) {
      return {
        street: noComma[1].trim(),
        plz: noComma[2],
        city: noComma[3].trim(),
      };
    }
    // Match: "12345 City" (no street, only PLZ+City)
    const plzOnly = addr.match(/^(\d{5})\s+(.+)$/);
    if (plzOnly) {
      return { street: "", plz: plzOnly[1], city: plzOnly[2].trim() };
    }
    return { street: addr, plz: "", city: "" };
  }

  // ── Helper: clean phone number ──
  function cleanPhone(raw) {
    return (raw || "")
      .replace(/^Tel\.\s*/i, "")
      .replace(/\s*Gratis anrufen!?\s*$/i, "")
      .trim();
  }

  // Deduplicate before export:
  // - rows with email: deduplicate by email (case-insensitive)
  // - rows without email: deduplicate by company+address
  const seenEmails = new Set();
  const seenCompanyAddr = new Set();
  data = data.filter((row) => {
    // Skip rows with empty company name
    const company = (row.company || "").trim();
    if (!company) return false;

    const email = (row.email || "").trim().toLowerCase();
    if (email) {
      if (seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    }
    // No email — deduplicate by company+address
    const key = `${company.toLowerCase()}|${(row.address || "").trim().toLowerCase()}`;
    if (seenCompanyAddr.has(key)) return false;
    seenCompanyAddr.add(key);
    return true;
  });

  const headers = [
    "Company Name",
    "Email",
    "Street",
    "PLZ",
    "City",
    "Ansprechpartner",
    "Website",
    "Telephone",
    "Source Portal",
    "Extracted Date",
  ];
  const csvContent = [
    headers.join(","),
    ...data.map((row) => {
      const contact = decodeEntities(row.contact || "");
      const addr = splitAddress(decodeEntities(row.address || ""));
      const values = [
        decodeEntities(row.company || ""),
        row.email || "",
        addr.street,
        addr.plz,
        addr.city,
        contact,
        row.link || "",
        cleanPhone(row.phone),
        row.source || "",
        row.extractedAt || "",
      ];
      return values
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    }),
  ].join("\n");

  // Prepend UTF-8 BOM (\uFEFF) to ensure Microsoft Excel correctly renders German umlauts (ä, ö, ü)
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `autoazubi_leads_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
