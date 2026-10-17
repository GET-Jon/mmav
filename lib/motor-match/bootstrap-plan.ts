export type MotorMatchBootstrapPlanItem = {
  make: string;
  model: string;
  calls: number;
};

export const MOTOR_MATCH_BOOTSTRAP_CORE_CALLS = 275;
export const MOTOR_MATCH_BOOTSTRAP_ADAPTIVE_CALLS = 50;
export const MOTOR_MATCH_BOOTSTRAP_CLEANUP_CALLS = 25;
export const MOTOR_MATCH_BOOTSTRAP_MAX_CALLS = 350;
export const MOTOR_MATCH_PAGE_LIMIT = 20;

export const motorMatchBootstrapPlan: MotorMatchBootstrapPlanItem[] = [
  { make: "Alfa Romeo", model: "Giulia", calls: 5 },
  { make: "Alfa Romeo", model: "Stelvio", calls: 4 },

  { make: "Audi", model: "A3", calls: 4 },
  { make: "Audi", model: "A4", calls: 7 },
  { make: "Audi", model: "A5", calls: 4 },
  { make: "Audi", model: "A6", calls: 4 },
  { make: "Audi", model: "A7", calls: 4 },
  { make: "Audi", model: "A8", calls: 3 },
  { make: "Audi", model: "Q3", calls: 3 },
  { make: "Audi", model: "Q5", calls: 5 },
  { make: "Audi", model: "Q7", calls: 4 },
  { make: "Audi", model: "Q8", calls: 3 },
  { make: "Audi", model: "RS Q8", calls: 2 },
  { make: "Audi", model: "RS3", calls: 3 },
  { make: "Audi", model: "RS5", calls: 3 },
  { make: "Audi", model: "RS7", calls: 2 },
  { make: "Audi", model: "S3", calls: 3 },
  { make: "Audi", model: "S4", calls: 4 },
  { make: "Audi", model: "S5", calls: 4 },
  { make: "Audi", model: "S6", calls: 3 },
  { make: "Audi", model: "S7", calls: 3 },
  { make: "Audi", model: "S8", calls: 2 },
  { make: "Audi", model: "SQ5", calls: 3 },
  { make: "Audi", model: "SQ7", calls: 2 },
  { make: "Audi", model: "SQ8", calls: 2 },
  { make: "Audi", model: "TT", calls: 3 },
  { make: "Audi", model: "TT RS", calls: 2 },
  { make: "Audi", model: "TTS", calls: 2 },

  { make: "BMW", model: "1 Series", calls: 4 },
  { make: "BMW", model: "2 Series", calls: 4 },
  { make: "BMW", model: "3 Series", calls: 7 },
  { make: "BMW", model: "4 Series", calls: 4 },
  { make: "BMW", model: "5 Series", calls: 5 },
  { make: "BMW", model: "7 Series", calls: 3 },
  { make: "BMW", model: "8 Series", calls: 4 },
  { make: "BMW", model: "M3", calls: 4 },
  { make: "BMW", model: "M4", calls: 4 },
  { make: "BMW", model: "M5", calls: 3 },
  { make: "BMW", model: "M8", calls: 2 },
  { make: "BMW", model: "X1", calls: 3 },
  { make: "BMW", model: "X3", calls: 5 },
  { make: "BMW", model: "X5", calls: 6 },
  { make: "BMW", model: "X6", calls: 3 },
  { make: "BMW", model: "Z3", calls: 2 },
  { make: "BMW", model: "Z4", calls: 3 },

  { make: "Land Rover", model: "Range Rover", calls: 4 },
  { make: "Land Rover", model: "Range Rover Sport", calls: 4 },

  { make: "Maserati", model: "Ghibli", calls: 3 },

  { make: "Mercedes-Benz", model: "C-Class", calls: 6 },
  { make: "Mercedes-Benz", model: "E-Class", calls: 6 },
  { make: "Mercedes-Benz", model: "G-Class", calls: 3 },
  { make: "Mercedes-Benz", model: "GL", calls: 2 },
  { make: "Mercedes-Benz", model: "GLE", calls: 5 },
  { make: "Mercedes-Benz", model: "GLS", calls: 3 },
  { make: "Mercedes-Benz", model: "M-Class", calls: 2 },

  { make: "Porsche", model: "911", calls: 4 },
  { make: "Porsche", model: "Cayenne", calls: 4 },
  { make: "Porsche", model: "Macan", calls: 5 },

  { make: "Subaru", model: "Forester", calls: 4 },
  { make: "Subaru", model: "Outback", calls: 5 },
  { make: "Subaru", model: "STI", calls: 4 },
  { make: "Subaru", model: "WRX", calls: 5 },

  { make: "Volkswagen", model: "GLI", calls: 4 },
  { make: "Volkswagen", model: "Golf", calls: 3 },
  { make: "Volkswagen", model: "Golf R", calls: 4 },
  { make: "Volkswagen", model: "GTI", calls: 5 },
  { make: "Volkswagen", model: "Jetta", calls: 4 },
  { make: "Volkswagen", model: "Tiguan", calls: 4 },

  { make: "Volvo", model: "S60", calls: 5 },
  { make: "Volvo", model: "S90", calls: 3 },
  { make: "Volvo", model: "V60", calls: 4 },
  { make: "Volvo", model: "V90", calls: 3 },
  { make: "Volvo", model: "XC60", calls: 4 },
  { make: "Volvo", model: "XC90", calls: 4 },
];

const planned = motorMatchBootstrapPlan.reduce((sum, item) => sum + item.calls, 0);
if (planned !== MOTOR_MATCH_BOOTSTRAP_CORE_CALLS) {
  throw new Error(`Motor Match bootstrap plan must total ${MOTOR_MATCH_BOOTSTRAP_CORE_CALLS} calls; got ${planned}.`);
}
