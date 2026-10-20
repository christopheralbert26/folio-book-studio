// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,primaryKey,index} from "drizzle-orm/sqlite-core";
export const projects=sqliteTable("projects",{
 owner:text("owner").notNull(),id:text("id").notNull(),title:text("title").notNull(),
 objectKey:text("object_key").notNull(),version:integer("version").notNull(),
 updated:integer("updated").notNull(),deleted:integer("deleted").notNull().default(0)
},t=>[primaryKey({columns:[t.owner,t.id]})]);
export const files=sqliteTable("files",{
 owner:text("owner").notNull(),hash:text("hash").notNull(),size:integer("size").notNull(),
 created:integer("created").notNull()
},t=>[primaryKey({columns:[t.owner,t.hash]})]);
export const editions=sqliteTable("editions",{
 id:text("id").primaryKey(),owner:text("owner").notNull(),projectId:text("project_id").notNull(),
 revision:integer("revision").notNull(),manifest:text("manifest").notNull(),created:integer("created").notNull(),
 status:text("status").notNull().default("prepared"),validation:text("validation")
},t=>[index("editions_owner").on(t.owner,t.projectId)]);
export const orders=sqliteTable("orders",{
 id:text("id").primaryKey(),owner:text("owner").notNull(),editionId:text("edition_id").notNull(),
 payload:text("payload").notNull(),state:text("state").notNull(),total:integer("total").notNull(),
 currency:text("currency").notNull(),expires:integer("expires").notNull(),
 paymentId:text("payment_id"),jobId:text("job_id"),attempted:integer("attempted").notNull().default(0),
 updated:integer("updated").notNull(),created:integer("created").notNull()
},t=>[index("orders_owner").on(t.owner)]);
export const events=sqliteTable("events",{
 id:text("id").primaryKey(),orderId:text("order_id").notNull(),kind:text("kind").notNull(),
 message:text("message").notNull(),created:integer("created").notNull()
});
