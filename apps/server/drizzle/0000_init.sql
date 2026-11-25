CREATE TYPE "public"."attachment_status" AS ENUM('PENDING', 'UPLOADED');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('TEXT', 'VOICE', 'KNOWLEDGE');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"uploader_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"message_id" uuid,
	"filename" varchar(255) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"upload_id" text,
	"status" "attachment_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_reads" (
	"user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"last_read_message_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_reads_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"name" varchar(48) NOT NULL,
	"type" "channel_type" DEFAULT 'TEXT' NOT NULL,
	"topic" varchar(256),
	"position" integer DEFAULT 0 NOT NULL,
	"last_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"parent_id" uuid,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"last_reply_at" timestamp with time zone,
	"nonce" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_members" (
	"server_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_members_server_id_user_id_pk" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(32) NOT NULL,
	"display_name" varchar(48) NOT NULL,
	"password_hash" text NOT NULL,
	"avatar_color" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_id_messages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "channels_server_idx" ON "channels" USING btree ("server_id","position");--> statement-breakpoint
CREATE INDEX "messages_channel_parent_id_idx" ON "messages" USING btree ("channel_id","parent_id","id");--> statement-breakpoint
CREATE INDEX "messages_parent_idx" ON "messages" USING btree ("parent_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_author_nonce_idx" ON "messages" USING btree ("author_id","nonce");--> statement-breakpoint
CREATE INDEX "server_members_user_idx" ON "server_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_invite_code_idx" ON "servers" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));