/**
 * Financial Packet Validator
 * Validates user-provided financial documents
 */

import { validateFinancialPacket, type ValidationResult } from '@/validation/ajv_instance';
import { createChildLogger } from '@/utils/logger';
import type { FinancialPacketV1SchemaJson } from '@/types/generated/financial_packet_v1';

const logger = createChildLogger('packet_validator');

export function validatePacket(
  data: unknown
): ValidationResult<FinancialPacketV1SchemaJson> {
  const result = validateFinancialPacket(data);

  if (!result.valid) {
    logger.error({ errors: result.errors }, 'Financial packet validation failed');
  } else {
    logger.debug({ symbol: (data as { meta?: { symbol?: string } })?.meta?.symbol }, 'Packet validation passed');
  }

  return result;
}

export function isValidPacket(data: unknown): data is FinancialPacketV1SchemaJson {
  return validateFinancialPacket(data).valid;
}

export interface PacketConsistencyCheck {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

export function checkPacketConsistency(
  packet: FinancialPacketV1SchemaJson
): PacketConsistencyCheck {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check balance sheet equation: Assets = Liabilities + Equity
  const { total_assets, total_liabilities, total_equity } = packet.balance_sheet;
  const balanceCheck = Math.abs(total_assets - (total_liabilities + total_equity));
  const tolerance = Math.abs(total_assets) * 0.01; // 1% tolerance

  if (balanceCheck > tolerance) {
    errors.push(
      `Balance sheet doesn't balance: Assets (${total_assets}) != Liabilities (${total_liabilities}) + Equity (${total_equity})`
    );
  }

  // Check current ratio consistency
  const { current_assets, current_liabilities } = packet.balance_sheet;
  if (current_liabilities > 0 && packet.derived_metrics?.current_ratio) {
    const calculatedRatio = current_assets / current_liabilities;
    const providedRatio = packet.derived_metrics.current_ratio;
    if (Math.abs(calculatedRatio - providedRatio) > 0.1) {
      warnings.push(
        `Current ratio mismatch: calculated ${calculatedRatio.toFixed(2)}, provided ${providedRatio}`
      );
    }
  }

  // Check margin consistency
  const { revenue, gross_profit, operating_income, net_income } = packet.income_statement;

  if (revenue > 0) {
    // Gross profit should be <= revenue
    if (gross_profit > revenue) {
      errors.push('Gross profit exceeds revenue');
    }

    // Operating income should be <= gross profit
    if (operating_income > gross_profit) {
      warnings.push('Operating income exceeds gross profit');
    }

    // Net income should generally be <= operating income (with exceptions)
    if (net_income > operating_income * 1.5) {
      warnings.push('Net income significantly exceeds operating income');
    }
  }

  // Check cash flow consistency
  const { operating_cash_flow, capital_expenditures, investing_cash_flow } =
    packet.cash_flow;

  // CapEx should be negative (cash outflow)
  if (capital_expenditures > 0) {
    warnings.push('Capital expenditures is positive (should typically be negative)');
  }

  // Check FCF if provided
  if (packet.derived_metrics?.free_cash_flow !== undefined) {
    const calculatedFcf = operating_cash_flow + capital_expenditures;
    const providedFcf = packet.derived_metrics.free_cash_flow;
    if (Math.abs(calculatedFcf - providedFcf) > Math.abs(providedFcf) * 0.05) {
      warnings.push(
        `FCF mismatch: calculated ${calculatedFcf}, provided ${providedFcf}`
      );
    }
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}
