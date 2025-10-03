/**
 * Parses structured data from raw OCR text of a Philippine ID.
 * @param {string} rawText - The multi-line text extracted from the ID.
 * @returns {object|null} An object with parsed ID fields or null if no input.
 */
export const parseIDFromOCR = rawText => {
  if (!rawText) return null;

  const text = rawText.toUpperCase();

  const result = {
    idType: 'Unknown',
    rawText,
    fields: {
      idNumber: null,
      firstname: null,
      middlename: null,
      lastname: null,
      fullname: null,
      birthDate: null,
      address: null,
      sex: null,
      nationality: 'FILIPINO', // Default for these IDs
      expirationDate: null,
    },
  };

  // --- Philippine National ID (PhilSys) ---
  if (text.includes('PAMBANSANG PAGKAKAKILANLAN')) {
    result.idType = 'Philippine National ID';

    const cleanText = text.replace(/\//g, ' ');

    const lastnameMatch = cleanText.match(
      /(?:APELYIDO LAST NAME)\s*[\r\n]+\s*([A-ZÑ' -]+)/
    );

    if (lastnameMatch) result.fields.lastname = lastnameMatch[1].trim();

    // Note: OCR sometimes reads "NAMES" as "NOMES"
    const givenNamesMatch = cleanText.match(
      /(?:MGA PANGALAN GIVEN NOMES|MGA PANGALAN GIVEN NAMES)\s*[\r\n]+\s*([A-ZÑ' -]+)/
    );
    if (givenNamesMatch) result.fields.firstname = givenNamesMatch[1].trim();

    const middlenameMatch = cleanText.match(
      /(?:GITNANG APELYIDO MIDDLE NAME)\s*[\r\n]+\s*([A-ZÑ' -]+)/
    );
    if (middlenameMatch) result.fields.middlename = middlenameMatch[1].trim();

    const idNumberMatch = text.match(/(\d{4}-\d{4}-\d{4}-\d{4})/);
    if (idNumberMatch) result.fields.idNumber = idNumberMatch[1];

    const birthDateMatch = text.match(
      /(?:DATE OF BIRTH)\s*[\r\n]+\s*([A-Z]+\s+\d{1,2},\s+\d{4})/
    );
    if (birthDateMatch) result.fields.birthDate = birthDateMatch[1].trim();

    const sexMatch = text.match(/(?:KASARIAN|SEX)\s*[\r\n]+\s*([A-Z])/);
    if (sexMatch) result.fields.sex = sexMatch[1].trim();

    // FIX: Capture multiline address until a keyword (like a district or region) is found
    const addressMatch = text.match(
      /(?:TIRAHAN\/ADDRESS|ADDRESS)\s*[\r\n]+\s*([\s\S]+?(?:NCR|REGION|DISTRICT))/
    );
    if (addressMatch)
      result.fields.address = addressMatch[1].replace(/\n/g, ' ').trim();
  }
  // --- PhilHealth ID ---
  else if (text.includes('PHILHEALTH')) {
    result.idType = 'PhilHealth ID';

    // Find ID number by its specific format
    const idNumberMatch = text.match(/\b(\d{2}-\d{9}-\d{1})\b/);
    if (idNumberMatch) result.fields.idNumber = idNumberMatch[1];

    // Find name by "Last, First Middle" format
    const nameMatch = text.match(/\b([A-ZÑ' -]+,\s*[A-ZÑ' -]+)\b/);
    if (nameMatch) {
      const parts = nameMatch[1].split(',');
      result.fields.lastname = parts[0].trim();
      if (parts[1]) {
        const givenNames = parts[1].trim().split(/\s+/);
        result.fields.firstname = givenNames[0];
        if (givenNames.length > 1) {
          result.fields.middlename = givenNames.slice(1).join(' ');
        }
      }
    }

    // Find birth date and sex on the same line
    const birthSexMatch = text.match(
      /\b((?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},\s+\d{4})\s*-\s*(MALE|FEMALE)\b/
    );
    if (birthSexMatch) {
      result.fields.birthDate = birthSexMatch[1].trim();
      result.fields.sex = birthSexMatch[2].trim();
    }

    // Assume address is the multiline text after the birthdate/sex line
    if (result.fields.birthDate) {
      const lines = text.split('\n');
      const birthDateLineIndex = lines.findIndex(line =>
        line.includes(result.fields.birthDate)
      );
      if (birthDateLineIndex > -1) {
        // Find the line that looks like an address (contains numbers and letters)
        const addressLine = lines
          .slice(birthDateLineIndex + 1)
          .find(line => /\d/.test(line) && /[A-Z]/.test(line));
        if (addressLine) result.fields.address = addressLine.trim();
      }
    }
  }

  // --- Final Step: Reconstruct Full Name ---
  if (result.fields.firstname && result.fields.lastname) {
    result.fields.fullname = [
      result.fields.firstname,
      result.fields.middlename,
      result.fields.lastname,
    ]
      .filter(Boolean) // Removes null/undefined middleName
      .join(' ');
  }

  // --- Driver’s License ---
  else if (text.includes('DRIVER') || text.includes('LTO')) {
    result.idType = `Driver's License`;

    // License number
    const licenseMatch = rawText.match(/DL No\.*\s*:?(\w+)/i);
    if (licenseMatch) result.fields.idNumber = licenseMatch[1];

    // Birthday
    const birthMatch = rawText.match(/Birthday\s*:?([\d-\/]+)/i);
    if (birthMatch) result.fields.birthDate = birthMatch[1];

    // Expiration date
    const expMatch = rawText.match(/Expiration\s*:?([\d-\/]+)/i);
    if (expMatch) result.fields.expirationDate = expMatch[1];
  }

  // Fallback → If no specific match, try generic ID number detection
  if (!result.fields.idNumber) {
    const genericIdMatch = rawText.match(/\b\d{8,12}\b/);
    if (genericIdMatch) result.fields.idNumber = genericIdMatch[0];
  }

  return result;
};
