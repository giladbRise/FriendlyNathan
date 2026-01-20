import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

/**
 * Encrypts a string using AES-256-CBC
 * @param text - The text to encrypt
 * @returns The encrypted text in format: iv:encryptedData
 */
export function encrypt(text: string): string {
  try {
    // Ensure encryption key is 32 bytes (64 hex characters)
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');

    // Generate a random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV and encrypted data concatenated with ':'
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts a string that was encrypted with the encrypt function
 * @param encryptedText - The encrypted text in format: iv:encryptedData
 * @returns The decrypted text
 */
export function decrypt(encryptedText: string): string {
  try {
    // Ensure encryption key is 32 bytes (64 hex characters)
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');

    // Split IV and encrypted data
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    // Decrypt the data
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}
