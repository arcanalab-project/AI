import { z } from "zod";
import { GENDERS, PAYMENT_STATUSES, PLANS, PROFILE_TYPES, VISIBILITIES } from "./types";

const gender = z.enum(GENDERS);

export const settingsPatchSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  discoveryDistanceKm: z.number().int().min(1).max(400).optional(),
  minDesiredAge: z.number().int().min(21).max(99).optional(),
  maxDesiredAge: z.number().int().min(21).max(99).optional(),
  genderPreferences: z.array(gender).min(1).optional(),
  profileVisibility: z.enum(VISIBILITIES).optional(),
  pausedAccount: z.boolean().optional(),
});

export const subscriptionPatchSchema = z.object({
  plan: z.enum(PLANS).optional(),
  paymentMethod: z.string().min(1).max(80).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  autoRenew: z.boolean().optional(),
});

export const profilePatchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  gender: gender.optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  heightCm: z.number().int().min(120).max(230).optional(),
  bodyType: z.string().max(40).optional().nullable(),
  profession: z.string().max(80).optional().nullable(),
  education: z.string().max(80).optional().nullable(),
  city: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).optional(),
  interests: z.array(z.string().min(1).max(40)).max(20).optional(),
  hobbies: z.array(z.string().min(1).max(40)).max(20).optional().nullable(),
  pronouns: z.string().max(40).optional().nullable(),
  profileType: z.enum(PROFILE_TYPES).optional(),
});

export const likeSchema = z.object({
  fromProfileId: z.string().min(1),
  toProfileId: z.string().min(1),
  type: z.enum(["like", "pass"]),
});

export const messageSchema = z.object({
  matchId: z.string().min(1),
  fromProfileId: z.string().min(1),
  body: z.string().min(1).max(1000),
});

export const eventSchema = z.object({
  organizerProfileId: z.string().min(1),
  title: z.string().min(1).max(80),
  city: z.string().min(1).max(80),
  startsAt: z.string().min(1),
  description: z.string().max(400),
});

export const mongoUserValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "datasetId",
      "profileId",
      "displayName",
      "gender",
      "birthDate",
      "heightCm",
      "city",
      "location",
      "photos",
      "interests",
      "settings",
      "subscription",
    ],
    properties: {
      datasetId: { enum: ["lesson", "mvp"] },
      profileId: { bsonType: "string" },
      displayName: { bsonType: "string" },
      gender: { enum: [...GENDERS] },
      birthDate: { bsonType: "string" },
      heightCm: { bsonType: ["int", "long", "double"] },
      bodyType: { bsonType: ["string", "null"] },
      profession: { bsonType: ["string", "null"] },
      education: { bsonType: ["string", "null"] },
      pronouns: { bsonType: ["string", "null"] },
      profileType: { enum: [...PROFILE_TYPES] },
      hobbies: {
        bsonType: "array",
        maxItems: 20,
        items: { bsonType: "string" },
      },
      photos: {
        bsonType: "array",
        minItems: 1,
        maxItems: 12,
      },
      interests: {
        bsonType: "array",
        maxItems: 20,
        items: { bsonType: "string" },
      },
      location: {
        bsonType: "object",
        required: ["type", "coordinates"],
        properties: {
          type: { enum: ["Point"] },
          coordinates: {
            bsonType: "array",
            minItems: 2,
            maxItems: 2,
          },
        },
      },
      settings: { bsonType: "object" },
      subscription: { bsonType: "object" },
    },
  },
};
