CREATE TABLE "paper_collections" (
	"paper_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	CONSTRAINT "paper_collections_paper_id_collection_id_pk" PRIMARY KEY("paper_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "paper_collections" ADD CONSTRAINT "paper_collections_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_collections" ADD CONSTRAINT "paper_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "paper_collections" ("paper_id", "collection_id")
SELECT "id", "collection_id" FROM "papers"
WHERE "collection_id" IS NOT NULL
ON CONFLICT DO NOTHING;