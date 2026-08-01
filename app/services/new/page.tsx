import {
  ArrowLeft,
  Ban,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createService } from "../actions";
import ServiceForm from "../service-form";
import styles from "../service-page.module.css";

interface NewServicePageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function NewServicePage({
  searchParams,
}: NewServicePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const parameters = await searchParams;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/services" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Services
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Plus size={28} />
          </div>

          <div>
            <p>Service Management</p>
            <h1>Add Service</h1>
            <span>
              Create a fixed-price labor service and configure its
              owner-mechanic allocation.
            </span>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        {parameters.error ? (
          <div className={styles.errorMessage}>
            <Ban size={20} />
            {parameters.error}
          </div>
        ) : null}

        <ServiceForm
          action={createService}
          submitLabel="Save Service"
          initialValues={{
            serviceCharge: 0,
            ownerPercentage: 20,
            mechanicPercentage: 80,
            isActive: 1,
          }}
        />
      </section>
    </main>
  );
}