import { BadRequestError } from "../lib/errors";

export class GSTService {
  /**
   * Validates the 15-character structural format of an Indian GSTIN.
   * Format: 
   * - 2 digits (state code)
   * - 10 chars (PAN: 5 letters, 4 numbers, 1 letter)
   * - 1 entity code (alphanumeric)
   * - 1 char (usually Z)
   * - 1 checksum (alphanumeric)
   */
  static validateGSTIN(gstin: string): boolean {
    if (!gstin || gstin.length !== 15) return false;
    
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[A-Z0-9]{1}[A-Z0-9]{1}$/i;
    
    if (!regex.test(gstin)) {
      return false;
    }
    
    return true;
  }

  /**
   * Stub for ITC (Input Tax Credit) matching with GSTR-2A/2B filings.
   * In a real implementation, this would call a GSTN-approved provider (Karza, Cleartax, etc).
   */
  static async matchITC(gstin: string, invoiceAmountPaise: bigint, invoiceDate: Date) {
    if (!this.validateGSTIN(gstin)) {
      throw new BadRequestError("Invalid GSTIN provided for ITC matching");
    }

    // Mock API simulation for Phase 6
    const amount = Number(invoiceAmountPaise) / 100;
    
    // Simulate Tax Breakdown (assuming 18% GST for mock purposes)
    const taxableValue = amount / 1.18;
    const cgst = taxableValue * 0.09;
    const sgst = taxableValue * 0.09;
    
    return {
      isValid: true,
      itcEligible: true,
      breakdown: {
        taxableValuePaise: BigInt(Math.round(taxableValue * 100)),
        cgstPaise: BigInt(Math.round(cgst * 100)),
        sgstPaise: BigInt(Math.round(sgst * 100)),
        igstPaise: 0n,
      },
      warnings: [],
      matchedWithGSTR2A: true // In production, this flag depends on actual portal fetch
    };
  }
}
