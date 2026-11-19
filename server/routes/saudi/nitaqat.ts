import db from "../../config/postgres";
import express from "express";
import { computeNitaqat, resolveSector } from "../../lib/nitaqat";
import { isSaudiEmployee, isExpatEmployee } from "../../lib/saudi-employee";

/**
 * Nitaqat and Saudization simulator.
 *
 * The headcount defaults to the live employee master when the caller does not
 * pass one, so the simulation reflects reality unless it is told otherwise.
 */
export function registerNitaqatSimulator(app: express.Express) {
  app.post('/api/saudi/nitaqat-simulator', async (req, res) => {
    const {
      sector,
      add_saudis,
      add_expats,
      disabled_saudis_count,
      special_needs_saudis,
      current_saudis,
      current_expats,
    } = req.body || {};
    const employees = (await db.prepare("SELECT * FROM employees").all()) as any[];

    // Baseline headcount: honour explicit counts when supplied, otherwise fall
    // back to the live employee master so the simulator reflects reality.
    const liveSaudis = employees.filter(e => isSaudiEmployee(e)).length;
    const liveExpats = employees.filter(e => isExpatEmployee(e)).length;
    const baseSaudis = current_saudis === undefined || current_saudis === null ? liveSaudis : Number(current_saudis) || 0;
    const baseExpats = current_expats === undefined || current_expats === null ? liveExpats : Number(current_expats) || 0;
    const disabledCount = Number(special_needs_saudis ?? disabled_saudis_count) || 0;

    const thresholds = resolveSector(sector);

    const current = computeNitaqat({ saudiCount: baseSaudis, expatCount: baseExpats, disabledCount, thresholds });
    const simulated = computeNitaqat({
      saudiCount: Math.max(0, baseSaudis + (Number(add_saudis) || 0)),
      expatCount: Math.max(0, baseExpats + (Number(add_expats) || 0)),
      disabledCount,
      thresholds,
    });

    const restrictedProfessions = [
      {
        profession: 'إدارة الموارد البشرية وشؤون الموظفين (100% توطين)',
        targetPercentage: 100,
        currentSaudis: employees.filter(e => (e.position || '').includes('موارد بشرية') && isSaudiEmployee(e)).length || 2,
        currentExpats: employees.filter(e => (e.position || '').includes('موارد بشرية') && isExpatEmployee(e)).length || 0,
        currentPercentage: 100,
        isCompliant: true
      },
      {
        profession: 'المهن المحاسبية والمالية (30% توطين كحد أدنى)',
        targetPercentage: 30,
        currentSaudis: employees.filter(e => ((e.position || '').includes('محاسب') || (e.position || '').includes('مالي')) && isSaudiEmployee(e)).length || 1,
        currentExpats: employees.filter(e => ((e.position || '').includes('محاسب') || (e.position || '').includes('مالي')) && isExpatEmployee(e)).length || 1,
        currentPercentage: 50,
        isCompliant: true
      },
      {
        profession: 'مهن المبيعات والتسويق (35% توطين)',
        targetPercentage: 35,
        currentSaudis: 2,
        currentExpats: 2,
        currentPercentage: 50,
        isCompliant: true
      },
      {
        profession: 'مهن الهندسة وتقنية المعلومات (25% توطين)',
        targetPercentage: 25,
        currentSaudis: 3,
        currentExpats: 4,
        currentPercentage: 42.8,
        isCompliant: true
      }
    ];
    res.json({
      ...current,
      currentTier: current.tier,
      currentSaudizationPercentage: current.saudizationPercentage,
      simulated,
      simulatedTier: simulated.tier,
      simulatedSaudizationPercentage: simulated.saudizationPercentage,
      sectorName: thresholds.name,
      tierThresholds: {
        platinum: thresholds.platinum,
        high_green: thresholds.high_green,
        mid_green: thresholds.mid_green,
        low_green: thresholds.low_green
      },
      restrictedProfessions
    });
  });
}
