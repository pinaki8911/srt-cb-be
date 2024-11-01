
export class ReportGenerator {
    generateReport(analysisResults) {
      return {
        timestamp: new Date(),
        totalScore: analysisResults.total,
        breakdown: {
          sittingScore: analysisResults.sitting,
          risingScore: analysisResults.rising,
          deductions: analysisResults.deductions
        },
        recommendations: this.generateRecommendations(analysisResults),
        riskAssessment: this.assessRisk(analysisResults.total)
      };
    }
  
    generateRecommendations(results) {
      const recommendations = [];
      
      if (results.deductions.find(d => d.type === 'hand')) {
        recommendations.push({
          area: 'Upper Body Strength',
          exercises: ['Wall pushups', 'Resistance band exercises']
        });
      }
  
      if (results.deductions.find(d => d.type === 'knee')) {
        recommendations.push({
          area: 'Lower Body Strength',
          exercises: ['Chair squats', 'Calf raises']
        });
      }
  
      return recommendations;
    }
  
    assessRisk(totalScore) {
      if (totalScore >= 8) return 'Low Risk';
      if (totalScore >= 6) return 'Moderate Risk';
      return 'High Risk';
    }
  }