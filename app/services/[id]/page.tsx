import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Ban,
  Edit3,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { updateService } from "../actions";
import ServiceForm from "../service-form";
import styles from "../service-page.module.css";

interface ServiceRow extends RowDataPacket {
  id: number;
  service_code: string;
  service_name: string;
  description: string | null;
  service_charge: number;
  owner_percentage: number;
  mechanic_percentage: number;
  estimated_minutes: number | null;
  is_active: number;
}

interface EditServicePageProps {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function EditServicePage({
  params,
  searchParams,
}: EditServicePageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN" && user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const routeParameters = await params;
  const queryParameters = await searchParams;

  const serviceId = Number(routeParameters.id);

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    notFound();
  }

  const [services] = await pool.execute<ServiceRow[]>(
    `
      SELECT
        id,
        service_code,
        service_name,
        description,
        service_charge,
        owner_percentage,
        mechanic_percentage,
        estimated_minutes,
        is_active
      FROM services
      WHERE id = ?
      LIMIT 1
    `,
    [serviceId],
  );

  const service = services[0];

  if (!service) {
    notFound();
  }

  const updateAction = updateService.bind(
    null,
    service.id,
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/services" className={styles.backButton}>
          <ArrowLeft size={19} />
          Back to Services
        </Link>

        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}>
            <Edit3 size={28} />
          </div>

          <div>
            <p>{service.service_code}</p>
            <h1>Edit Service</h1>
            <span>
              Update the fixed charge, estimated time, and
              commission allocation.
            </span>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        {queryParameters.error ? (
          <div className={styles.errorMessage}>
            <Ban size={20} />
            {queryParameters.error}
          </div>
        ) : null}

        <ServiceForm
          action={updateAction}
          submitLabel="Save Changes"
          initialValues={{
            serviceName: service.service_name,
            description: service.description ?? "",
            serviceCharge: Number(service.service_charge),
            ownerPercentage: Number(
              service.owner_percentage,
            ),
            mechanicPercentage: Number(
              service.mechanic_percentage,
            ),
            estimatedMinutes: service.estimated_minutes,
            isActive: service.is_active,
          }}
        />
      </section>
    </main>
  );
}