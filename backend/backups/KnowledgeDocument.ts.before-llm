import mongoose, { Schema } from "mongoose";

export interface IKnowledgeDocument {
  slug: string;
  title: string;
  category: string;
  content: string;
  source: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const knowledgeDocumentSchema = new Schema<IKnowledgeDocument>(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    content: { type: String, required: true },
    source: { type: String, required: true },
    tags: { type: [String], default: [] }
  },
  { timestamps: true }
);

export const KnowledgeDocument = mongoose.model<IKnowledgeDocument>(
  "KnowledgeDocument",
  knowledgeDocumentSchema
);
