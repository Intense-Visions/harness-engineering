import { z } from 'zod';

export const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  age: z.number().int().min(0).max(150),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export const OrderSchema = z.object({
  amount: z.number().positive().max(1000000),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  items: z.array(z.string()).min(1),
});

export const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  country: z.string().length(2),
});
